import { Types } from "mongoose"
import type { OAuthTokens } from "@ai-sdk/mcp"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { OpexMcpServer, type IOpexMcpOauth, type IOpexMcpServer } from "@/lib/db/models/Opex"
import { isSecretBoxConfigured } from "@/lib/crypto/secretBox"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { OPEX_MCP_AUDIT_ENTITY, OPEX_MCP_EVENT, OPEX_MCP_OAUTH_CALLBACK_PATH, OPEX_MCP_SECTION_PATH, usesMcpOauth, type OpexMcpOauthStartDto } from "../../mcp"
import { describeMcpError } from "./connect"
import { createMcpOauthProvider, OpexMcpOauthScopeError, type OpexMcpOauthProvider, type StoredMcpClient } from "./oauth-provider"
import { emptyMcpOauth, hashState, openJson, openText, patchMcpOauth } from "./oauth-store"

/**
 * Fluxo OAuth dos MCPs do Agente Opex (OPE-176), feito pelo servidor do Opex com a `@ai-sdk/mcp`:
 * descoberta dos metadados, registro dinâmico do cliente (quando não há client id cadastrado),
 * authorization code com PKCE, retorno em `OPEX_MCP_OAUTH_CALLBACK_PATH` (sessão do dono, `state` de
 * uso único com validade curta), troca do código e desconexão com revogação. Tokens nunca saem daqui.
 */

const log = loggerFor({ module: "opex-agent-mcp" })

type ServerDoc = IOpexMcpServer & { _id: Types.ObjectId }

const sdk = () => import("@ai-sdk/mcp")

async function loadOauthServer(id: string): Promise<ServerDoc> {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, "MCP não encontrado", "OPEX_MCP_NOT_FOUND")
    await dbConnect()
    const doc = await OpexMcpServer.findById(id).lean<ServerDoc>()
    if (!doc) throw new DomainError(404, "MCP não encontrado", "OPEX_MCP_NOT_FOUND")
    if (!usesMcpOauth(doc)) throw new DomainError(400, "Este MCP não usa OAuth: escolha OAuth na autenticação e salve antes de autorizar.", "OPEX_MCP_OAUTH_DISABLED")
    return doc
}

/** Subdocumento `oauth` (cria um vazio nos MCPs antigos que passaram a usar OAuth). */
async function oauthOf(doc: ServerDoc): Promise<IOpexMcpOauth> {
    if (doc.oauth) return doc.oauth
    const oauth = emptyMcpOauth()
    await OpexMcpServer.updateOne({ _id: doc._id }, { $set: { oauth } }, { timestamps: false })
    return oauth
}

async function announce(id: string, action: string, actorId: string): Promise<void> {
    await recordAudit({ userId: actorId, entidade: OPEX_MCP_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { oauth: action } })
    await publishAppEvent(OPEX_MCP_EVENT, { id })
}

export function mcpOauthRedirectUri(origin: string): string {
    return `${origin.replace(/\/+$/, "")}${OPEX_MCP_OAUTH_CALLBACK_PATH}`
}

/** Botão Autorizar: prepara o pedido (state + PKCE) e devolve a página do provedor. */
export async function startMcpOauth(id: string, origin: string, actorId: string): Promise<OpexMcpOauthStartDto> {
    const doc = await loadOauthServer(id)
    if (!isSecretBoxConfigured()) throw new DomainError(400, "Defina INTEGRATIONS_ENCRYPTION_KEY no servidor para autorizar MCPs por OAuth.", "OPEX_MCP_ENCRYPTION_MISSING")
    let oauth = await oauthOf(doc)
    const redirectUri = mcpOauthRedirectUri(origin)
    // Cliente registrado para outro endereço do Opex (ex.: IP da rede x domínio): registra de novo.
    const stored = openJson<StoredMcpClient>(oauth.client)
    if (!oauth.clientId && stored && stored.redirectUri !== redirectUri) {
        await patchMcpOauth(id, { client: null })
        oauth = { ...oauth, client: null }
    }
    const provider = createMcpOauthProvider(id, oauth, { mode: "start", redirectUri, actorId })
    const { auth } = await sdk()
    try {
        await auth(provider, { serverUrl: doc.url, ...(oauth.scope ? { scope: oauth.scope } : {}) })
    } catch (error) {
        const message = describeMcpError(error)
        await patchMcpOauth(id, { status: "error", lastError: message, pending: null })
        await publishAppEvent(OPEX_MCP_EVENT, { id })
        log.warn({ mcp: doc.slug, err: message }, "[opex-mcp] falha ao iniciar a autorização OAuth")
        throw new DomainError(502, `Não foi possível iniciar a autorização: ${message}`, "OPEX_MCP_OAUTH_FAILED")
    }
    if (!provider.authorizationUrl) throw new DomainError(502, "O servidor de autorização não devolveu a página de login.", "OPEX_MCP_OAUTH_FAILED")
    const pending = (await OpexMcpServer.findById(id).select({ "oauth.pending": 1 }).lean<{ oauth?: IOpexMcpOauth | null }>())?.oauth?.pending
    log.info({ mcp: doc.slug }, "[opex-mcp] autorização OAuth iniciada")
    return { url: provider.authorizationUrl.toString(), expiresAt: (pending?.expiresAt ? new Date(pending.expiresAt) : new Date()).toISOString() }
}

export interface McpOauthCallbackInput {
    state: string | null
    code: string | null
    error: string | null
    errorDescription: string | null
    iss: string | null
}

export interface McpOauthCallbackResult {
    ok: boolean
    mcpId: string | null
    message: string
    /** Página de volta (origem pública do pedido + seção MCPs). */
    redirectTo: string | null
}

function backTo(redirectUri: string, params: Record<string, string>): string | null {
    try {
        const url = new URL(OPEX_MCP_SECTION_PATH, new URL(redirectUri).origin)
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
        return url.toString()
    } catch {
        return null
    }
}

async function revokeQuietly(oauth: IOpexMcpOauth, provider: OpexMcpOauthProvider, tokens: OAuthTokens | null): Promise<void> {
    if (!tokens) return
    await revokeTokens(oauth, provider, tokens).catch(() => undefined)
}

/** Retorno do provedor: confere o `state` (uso único, validade) e troca o código pelo token. */
export async function finishMcpOauth(input: McpOauthCallbackInput, actorId: string): Promise<McpOauthCallbackResult> {
    if (!input.state) return { ok: false, mcpId: null, message: "Retorno sem state: comece a autorização pelo botão Autorizar.", redirectTo: null }
    await dbConnect()
    const stateHash = hashState(input.state).toString("hex")
    const doc = await OpexMcpServer.findOne({ "oauth.pending.stateHash": stateHash }).lean<ServerDoc>()
    const pending = doc?.oauth?.pending
    if (!doc || !doc.oauth || !pending) return { ok: false, mcpId: null, message: "Pedido de autorização não encontrado ou já usado: clique em Autorizar de novo.", redirectTo: null }
    const id = String(doc._id)
    // Uso único: o pedido sai antes da troca (um segundo retorno com o mesmo state é recusado).
    const consumed = await patchMcpOauth(id, { pending: null }, { filter: { "oauth.pending.stateHash": stateHash } })
    const fail = async (message: string): Promise<McpOauthCallbackResult> => {
        await patchMcpOauth(id, { status: "error", lastError: message })
        await announce(id, "falhou", actorId)
        log.warn({ mcp: doc.slug, err: message }, "[opex-mcp] autorização OAuth recusada")
        return { ok: false, mcpId: id, message, redirectTo: backTo(pending.redirectUri, { oauth: "erro", mcp: id }) }
    }
    if (!consumed) return { ok: false, mcpId: id, message: "Pedido de autorização já usado: clique em Autorizar de novo.", redirectTo: backTo(pending.redirectUri, { oauth: "erro", mcp: id }) }
    if (new Date(pending.expiresAt).getTime() < Date.now()) return fail("O pedido de autorização expirou: clique em Autorizar de novo.")
    if (pending.actorId && pending.actorId !== actorId) return fail("O retorno chegou em outra sessão: autorize de novo pela mesma sessão.")
    if (input.error) return fail(`O provedor recusou a autorização: ${(input.errorDescription || input.error).slice(0, 300)}`)
    if (!input.code) return fail("Retorno sem código de autorização.")
    if (!usesMcpOauth(doc)) return fail("O MCP deixou de usar OAuth.")
    const provider = createMcpOauthProvider(id, doc.oauth, { mode: "callback", redirectUri: pending.redirectUri, pending, actorId })
    const { auth } = await sdk()
    try {
        await auth(provider, { serverUrl: doc.url, authorizationCode: input.code, callbackState: input.state, ...(input.iss ? { callbackIssuer: input.iss } : {}), ...(doc.oauth.scope ? { scope: doc.oauth.scope } : {}) })
    } catch (error) {
        if (error instanceof OpexMcpOauthScopeError) {
            await revokeQuietly(doc.oauth, provider, provider.rejectedTokens)
            return fail(error.message)
        }
        return fail(`Não foi possível concluir a autorização: ${describeMcpError(error)}`)
    }
    await patchMcpOauth(id, { status: "authorized", lastError: null, authorizedAt: new Date() })
    await OpexMcpServer.updateOne({ _id: doc._id }, { $set: { lastError: null } }, { timestamps: false })
    await announce(id, "autorizado", actorId)
    log.info({ mcp: doc.slug }, "[opex-mcp] autorização OAuth concluída")
    return { ok: true, mcpId: id, message: "MCP autorizado.", redirectTo: backTo(pending.redirectUri, { oauth: "ok", mcp: id }) }
}

/** Endpoint de revogação (RFC 7009) pelos metadados do servidor de autorização. */
async function revocationEndpoint(oauth: IOpexMcpOauth): Promise<string | null> {
    if (oauth.server?.revocationEndpoint) return oauth.server.revocationEndpoint
    const base = oauth.server?.authorizationServerUrl
    if (!base) return null
    const url = new URL(base)
    const path = url.pathname.replace(/\/+$/, "")
    const candidates = [`${url.origin}/.well-known/oauth-authorization-server${path}`, `${url.origin}/.well-known/openid-configuration${path}`, `${url.origin}${path}/.well-known/openid-configuration`]
    for (const candidate of candidates) {
        const response = await fetch(candidate, { signal: AbortSignal.timeout(5_000), headers: { accept: "application/json" } }).catch(() => null)
        if (!response?.ok) continue
        const metadata = (await response.json().catch(() => null)) as { revocation_endpoint?: unknown } | null
        if (typeof metadata?.revocation_endpoint === "string") return metadata.revocation_endpoint
    }
    return null
}

async function revokeTokens(oauth: IOpexMcpOauth, provider: OpexMcpOauthProvider, tokens: OAuthTokens): Promise<boolean> {
    const endpoint = await revocationEndpoint(oauth)
    if (!endpoint) return false
    const client = await provider.clientInformation()
    let revoked = false
    for (const [token, hint] of [
        [tokens.refresh_token, "refresh_token"],
        [tokens.access_token, "access_token"],
    ] as const) {
        if (!token) continue
        const body = new URLSearchParams({ token, token_type_hint: hint })
        if (client?.client_id) body.set("client_id", client.client_id)
        if (client?.client_secret) body.set("client_secret", client.client_secret)
        const response = await fetch(endpoint, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(5_000) }).catch(() => null)
        revoked ||= Boolean(response?.ok)
    }
    return revoked
}

/** Desconectar: revoga no provedor (melhor esforço) e apaga tokens, pedido e cliente dinâmico. */
export async function disconnectMcpOauth(id: string, actorId: string): Promise<{ revoked: boolean }> {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, "MCP não encontrado", "OPEX_MCP_NOT_FOUND")
    await dbConnect()
    const doc = await OpexMcpServer.findById(id).lean<ServerDoc>()
    if (!doc) throw new DomainError(404, "MCP não encontrado", "OPEX_MCP_NOT_FOUND")
    const oauth = doc.oauth
    if (!oauth) return { revoked: false }
    const tokens = openJson<OAuthTokens>(oauth.tokens)
    const provider = createMcpOauthProvider(id, oauth, { mode: "headless" })
    const revoked = tokens ? await revokeTokens(oauth, provider, tokens).catch(() => false) : false
    await patchMcpOauth(id, { tokens: null, expiresAt: null, pending: null, authorizedAt: null, lastError: null, status: "not_authorized", ...(oauth.clientId ? {} : { client: null }) }, { incTokenVersion: true })
    await announce(id, revoked ? "desconectado (revogado no provedor)" : "desconectado", actorId)
    log.info({ mcp: doc.slug, revoked }, "[opex-mcp] OAuth desconectado")
    return { revoked }
}

/** Há token salvo (sem ele, nem tenta conectar: precisa autorizar). */
export function hasMcpOauthTokens(oauth: IOpexMcpOauth | null | undefined): boolean {
    return Boolean(oauth && openText(oauth.tokens))
}
