import type { IntegrationInfo } from "@opencode/client"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { forwardOauthCallbackCommand } from "../commands"
import { OPENCODE_RESOURCE_AUDIT_ENTITY, OPENCODE_RESOURCES_UPDATED_EVENT } from "../constants"
import { authorizationStateOf, callbackTargetOf, forwardableCallback, type OauthCallbackTarget } from "../mcp-oauth"
import type { McpAuthorizationDto, McpOauthAttemptDto, McpOauthStatusDto } from "../types"
import type { ScopeContext } from "./context"
import { entryOf } from "./mcps"

/**
 * Autorização OAuth dos MCPs remotos do OpenCode (OPE-176) — SOMENTE servidor. Cada MCP remoto tem
 * uma integração no OpenCode (`integrationID` do `mcp.list`, método `oauth` com o mesmo id): o login
 * começa por `integration.oauth.connect`, a situação vem de `mcp.list` (`needs_auth`/`failed`) e das
 * credenciais da integração, e desconectar remove a credencial (`credential.remove`). As credenciais
 * ficam no OpenCode do host; nada de token passa pelo Opex.
 */

const log = loggerFor({ module: "opencode-resources" })

interface PendingAttempt {
    scope: string
    name: string
    integrationId: string
    location: ScopeContext["location"]
    target: OauthCallbackTarget | null
    beforeIds: string[]
    expiresAt: number
    actorId: string
    origin: string
}

const globalForAttempts = globalThis as unknown as { opencodeMcpOauthAttempts?: Map<string, PendingAttempt> }
const attempts = (globalForAttempts.opencodeMcpOauthAttempts ??= new Map<string, PendingAttempt>())

function prune(now = Date.now()) {
    for (const [id, attempt] of attempts) if (attempt.expiresAt + 60_000 < now) attempts.delete(id)
}

async function serverOf(ctx: ScopeContext, name: string) {
    const servers = (await ctx.host.client.mcp.list({ location: ctx.location })).data
    return servers.find((server) => server.name === name) ?? null
}

async function integrationOf(ctx: ScopeContext, integrationId: string): Promise<IntegrationInfo | null> {
    return (await ctx.host.client.integration.get({ integrationID: integrationId, location: ctx.location }).catch(() => null))?.data ?? null
}

export const oauthConnections = (integration: IntegrationInfo | null) =>
    (integration?.connections ?? []).flatMap((item) => (item.type === "credential" && item.method === "oauth" ? [{ id: item.id, label: item.label, status: item.status?.status ?? null }] : []))

/** Situação da autorização de um MCP remoto no escopo. */
export async function mcpAuthorization(ctx: ScopeContext, name: string): Promise<McpAuthorizationDto> {
    const entry = await entryOf(ctx, name)
    if (entry.config.type !== "remote") return { state: "not_required", error: null, integrationId: null, connections: [] }
    const server = await serverOf(ctx, name)
    const integrationId = server?.integrationID ?? null
    const connections = integrationId ? oauthConnections(await integrationOf(ctx, integrationId)) : []
    return { ...authorizationStateOf(server?.status, connections), integrationId, connections }
}

async function announce(name: string, scope: string, action: "autorizar" | "desconectar", actorId: string, origin: string, detail: Record<string, unknown> = {}) {
    await recordAudit({
        userId: actorId,
        entidade: OPENCODE_RESOURCE_AUDIT_ENTITY,
        entidadeId: `mcp:${scope}:${name}`,
        acao: AcaoAuditoria.ATUALIZAR,
        depois: { tipo: "mcp", escopo: scope, nome: name, acao: action, origem: origin, ...detail },
    })
    log.info({ kind: "mcp", scope, name, action, origin }, "[opencode-resources] Autorização de MCP")
    await publishAppEvent(OPENCODE_RESOURCES_UPDATED_EVENT, { kind: "mcp", scope })
}

/** Autorizar: inicia o login no OpenCode (descoberta, registro e PKCE ficam com ele). */
export async function startMcpOauth(ctx: ScopeContext, scope: string, name: string, actor: { id: string; origin: string }): Promise<McpOauthAttemptDto> {
    const entry = await entryOf(ctx, name)
    if (entry.config.type !== "remote") throw new DomainError(400, "OAuth vale só para MCP remoto.", "OPENCODE_MCP_OAUTH_UNSUPPORTED")
    if (entry.disabled) throw new DomainError(400, "Ligue o MCP antes de autorizar.", "OPENCODE_MCP_DISABLED")
    if (entry.config.oauth === false) throw new DomainError(400, "O OAuth automático está desligado neste MCP: escolha OAuth na autenticação e salve.", "OPENCODE_MCP_OAUTH_DISABLED")
    const server = await serverOf(ctx, name)
    const integrationId = server?.integrationID
    if (!integrationId) throw new DomainError(409, "O OpenCode ainda não preparou a autorização deste MCP: clique em Testar conexão e tente de novo.", "OPENCODE_MCP_OAUTH_NOT_READY")
    const beforeIds = oauthConnections(await integrationOf(ctx, integrationId)).map((item) => item.id)
    const attempt = (await ctx.host.client.integration.oauth.connect({ integrationID: integrationId, location: ctx.location, methodID: integrationId })).data
    const target = callbackTargetOf(attempt.url)
    prune()
    attempts.set(attempt.attemptID, { scope, name, integrationId, location: ctx.location, target, beforeIds, expiresAt: attempt.time.expires, actorId: actor.id, origin: actor.origin })
    return { attemptId: attempt.attemptID, url: attempt.url, instructions: attempt.instructions, mode: attempt.mode, expiresAt: attempt.time.expires, localCallback: Boolean(target) }
}

function attemptOf(attemptId: string, scope: string, name: string): PendingAttempt {
    const attempt = attempts.get(attemptId)
    if (!attempt || attempt.scope !== scope || attempt.name !== name) throw new DomainError(404, "Este login expirou ou não existe mais: clique em Autorizar de novo.", "OPENCODE_LOGIN_NOT_FOUND")
    return attempt
}

/**
 * Depois de concluir: uma autorização nova substitui as anteriores do mesmo MCP (credenciais OAuth
 * antigas saem), reconecta o MCP, audita e avisa a tela.
 */
async function settle(ctx: ScopeContext, attemptId: string, attempt: PendingAttempt) {
    attempts.delete(attemptId)
    const connections = oauthConnections(await integrationOf(ctx, attempt.integrationId))
    const created = connections.filter((item) => !attempt.beforeIds.includes(item.id))
    if (created.length) {
        for (const old of connections.filter((item) => attempt.beforeIds.includes(item.id))) await ctx.host.client.credential.remove({ credentialID: old.id }).catch(() => undefined)
    }
    await ctx.host.client.mcp.connect({ server: attempt.name, location: ctx.location }).catch(() => undefined)
    await announce(attempt.name, attempt.scope, "autorizar", attempt.actorId, attempt.origin, { credenciaisSubstituidas: created.length ? connections.length - created.length : 0 })
}

/** Situação da tentativa (a tela consulta até concluir); ao concluir, acerta credenciais e conexão. */
export async function mcpOauthStatus(ctx: ScopeContext, scope: string, name: string, attemptId: string): Promise<McpOauthStatusDto> {
    const attempt = attemptOf(attemptId, scope, name)
    const data = (await ctx.host.client.integration.oauth.status({ integrationID: attempt.integrationId, attemptID: attemptId, location: ctx.location })).data
    if (data.status === "complete") await settle(ctx, attemptId, attempt)
    else if (data.status !== "pending") attempts.delete(attemptId)
    return { status: data.status, message: "message" in data && typeof data.message === "string" ? data.message : null }
}

/**
 * Conclui com o código (modo `code`) ou repassando a URL de retorno colada ao loopback do host (modo
 * `auto`, navegador fora do host).
 */
export async function completeMcpOauth(ctx: ScopeContext, scope: string, name: string, attemptId: string, input: { code?: string; callbackUrl?: string }): Promise<McpOauthStatusDto> {
    const attempt = attemptOf(attemptId, scope, name)
    if (input.callbackUrl) {
        if (!attempt.target) throw new DomainError(400, "Este login não retorna para o host: conclua pela página aberta.", "OPENCODE_MCP_OAUTH_NO_LOCAL_CALLBACK")
        const check = forwardableCallback(input.callbackUrl, attempt.target)
        if (!check.ok) throw new DomainError(400, check.message, "OPENCODE_MCP_OAUTH_CALLBACK_INVALID")
        const result = await ctx.host.run(forwardOauthCallbackCommand(check.url), 30_000, { redactedAs: `(repassando o retorno do OAuth do MCP ${name} ao OpenCode)` })
        const httpStatus = Number(result.output.trim().split("\n").at(-1) ?? 0)
        if (result.exitCode !== 0 || !httpStatus) throw new DomainError(502, "O servidor de retorno do OpenCode não respondeu no host: o login pode ter expirado. Clique em Autorizar de novo.", "OPENCODE_MCP_OAUTH_CALLBACK_FAILED")
    } else if (input.code) {
        await ctx.host.client.integration.oauth.complete({ integrationID: attempt.integrationId, attemptID: attemptId, location: ctx.location, code: input.code })
    } else {
        throw new DomainError(400, "Informe o código ou a URL de retorno.", "OPENCODE_MCP_OAUTH_CODE_REQUIRED")
    }
    // O OpenCode troca o código em segundo plano: espera a tentativa sair de "pendente".
    for (let tries = 0; tries < 20; tries++) {
        const status = await mcpOauthStatus(ctx, scope, name, attemptId).catch((error: unknown) => {
            if (error instanceof DomainError && error.code === "OPENCODE_LOGIN_NOT_FOUND") return { status: "complete" as const, message: null }
            throw error
        })
        if (status.status !== "pending") return status
        await new Promise((resolve) => setTimeout(resolve, 500))
    }
    return { status: "pending", message: null }
}

export async function cancelMcpOauth(ctx: ScopeContext, scope: string, name: string, attemptId: string): Promise<void> {
    const attempt = attempts.get(attemptId)
    attempts.delete(attemptId)
    if (!attempt || attempt.scope !== scope || attempt.name !== name) return
    await ctx.host.client.integration.oauth.cancel({ integrationID: attempt.integrationId, attemptID: attemptId, location: ctx.location }).catch(() => undefined)
}

/** Desconectar: remove as credenciais OAuth do MCP no OpenCode e desconecta o servidor. */
export async function disconnectMcpOauth(ctx: ScopeContext, scope: string, name: string, actor: { id: string; origin: string }): Promise<{ removed: number }> {
    const authorization = await mcpAuthorization(ctx, name)
    for (const connection of authorization.connections) await ctx.host.client.credential.remove({ credentialID: connection.id })
    await ctx.host.client.mcp.disconnect({ server: name, location: ctx.location }).catch(() => undefined)
    await ctx.host.client.mcp.connect({ server: name, location: ctx.location }).catch(() => undefined)
    await announce(name, scope, "desconectar", actor.id, actor.origin, { credenciaisRemovidas: authorization.connections.length })
    return { removed: authorization.connections.length }
}
