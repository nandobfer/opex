import { DomainError } from "@/lib/api/route"
import { clearAiCatalogCache } from "@/lib/ai/catalog"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { toDomainError } from "@/features/opencode-accounts/server/service"
import { OPENCODE_RESOURCE_AUDIT_ENTITY, OPENCODE_RESOURCES_UPDATED_EVENT, type OpencodeResourceKind } from "../constants"
import { decodeResourceId, encodeResourceId, type ResourceKey } from "../ids"
import type { McpSecretsInput, ResourceContentInput, ResourceCreateInput, ResourceInstallInput, ResourceUpdateManyInput } from "../schemas"
import type { McpTestResultDto, OpencodeResourceDetailDto, OpencodeResourceDto, OpencodeScopeDto, ResourceMutationResultDto, ResourceUpdateManyResultDto } from "../types"
import { rollbackTo } from "./backups"
import { openScope, type ScopeContext } from "./context"
import type { KindHandler, MutationEffect } from "./handler"
import { agentHandler, commandHandler } from "./markdown-kinds"
import { mcpHandler, setMcpSecrets, testMcp } from "./mcps"
import { pluginHandler } from "./plugins"
import { listScopes } from "./scopes"
import { skillHandler } from "./skills"
import { clearVersionCache } from "./versions"
import { withConfigLock } from "./lock"

/**
 * Recursos do OpenCode (skills, agentes, comandos, plugins e MCPs) — SOMENTE servidor. Fachada única
 * usada pelas rotas da tela e pelas ferramentas do Agente Opex: toda alteração passa pelo lock, faz
 * backup antes, confere a configuração depois (desfaz se ficou inválida), recarrega o OpenCode,
 * audita (sem segredos) e avisa a tela pelo Pusher.
 */

const log = loggerFor({ module: "opencode-resources" })

export interface ResourceActor {
    id: string
    origin: "ui" | "opex-agent"
}

const HANDLERS: Record<OpencodeResourceKind, KindHandler> = { skill: skillHandler, agent: agentHandler, command: commandHandler, plugin: pluginHandler, mcp: mcpHandler }

const AUDIT_ACTIONS = {
    criar: AcaoAuditoria.CRIAR,
    instalar: AcaoAuditoria.CRIAR,
    editar: AcaoAuditoria.ATUALIZAR,
    ligar: AcaoAuditoria.ATUALIZAR,
    desligar: AcaoAuditoria.ATUALIZAR,
    atualizar: AcaoAuditoria.ATUALIZAR,
    segredos: AcaoAuditoria.ATUALIZAR,
    excluir: AcaoAuditoria.EXCLUIR,
} as const
type MutationAction = keyof typeof AUDIT_ACTIONS

export function parseResourceId(id: string): ResourceKey {
    const key = decodeResourceId(id)
    if (!key) throw new DomainError(400, "Id de recurso inválido: use o id devolvido pela listagem", "OPENCODE_RESOURCE_ID_INVALID")
    return key
}

async function guard<T>(run: () => Promise<T>): Promise<T> {
    try {
        return await run()
    } catch (error) {
        throw toDomainError(error)
    }
}

export async function listOpencodeScopes(): Promise<OpencodeScopeDto[]> {
    return listScopes()
}

export async function listResources(kind: OpencodeResourceKind, scope: string, options: { refresh?: boolean } = {}): Promise<OpencodeResourceDto[]> {
    return guard(async () => {
        if (options.refresh) clearVersionCache()
        const ctx = await openScope(scope)
        const items = await HANDLERS[kind].list(ctx, options)
        return items.sort((a, b) => Number(a.builtin) - Number(b.builtin) || a.name.localeCompare(b.name))
    })
}

export async function getResource(id: string): Promise<OpencodeResourceDetailDto> {
    const key = parseResourceId(id)
    return guard(async () => HANDLERS[key.kind].get(await openScope(key.scope), key.name))
}

/** Confere a configuração depois de gravar: inválida → desfaz pelo backup e recusa. */
async function verify(ctx: ScopeContext): Promise<void> {
    try {
        await ctx.host.client.config.get({ location: ctx.location })
    } catch (error) {
        const tag = (error as { _tag?: unknown; reason?: unknown } | null)?._tag
        if (tag === "ClientError" && (error as { reason?: unknown }).reason === "Transport") return
        if (ctx.lastBackupId) await rollbackTo(ctx.host, ctx.lastBackupId).catch((rollbackError: unknown) => log.error({ err: rollbackError }, "[opencode-resources] Falha ao desfazer"))
        throw new DomainError(422, `O OpenCode recusou a configuração alterada e a mudança foi desfeita: ${error instanceof Error ? error.message : String(error)}`, "OPENCODE_CONFIG_REJECTED")
    }
}

async function mutate(key: ResourceKey, action: MutationAction, actor: ResourceActor, run: (ctx: ScopeContext, handler: KindHandler) => Promise<MutationEffect & { names?: string[] }>, detail: Record<string, unknown> = {}): Promise<ResourceMutationResultDto & { names?: string[] }> {
    return withConfigLock(() =>
        guard(async () => {
            const ctx = await openScope(key.scope)
            const effect = await run(ctx, HANDLERS[key.kind])
            await verify(ctx)
            await ctx.host.client.location.reload().catch(() => undefined)
            if (key.kind === "agent" || key.kind === "skill") clearAiCatalogCache()
            await recordAudit({
                userId: actor.id,
                entidade: OPENCODE_RESOURCE_AUDIT_ENTITY,
                entidadeId: `${key.kind}:${key.scope}:${key.name}`,
                acao: AUDIT_ACTIONS[action],
                depois: { tipo: key.kind, escopo: key.scope, nome: key.name, acao: action, origem: actor.origin, backup: ctx.lastBackupId, ...detail },
            })
            log.info({ kind: key.kind, scope: key.scope, name: key.name, action, origin: actor.origin }, "[opencode-resources] Recurso alterado")
            await publishAppEvent(OPENCODE_RESOURCES_UPDATED_EVENT, { kind: key.kind, scope: key.scope })
            return { id: encodeResourceId(key), backupId: ctx.lastBackupId, restartRequired: Boolean(effect.restartRequired), names: effect.names }
        }),
    )
}

function unsupported(kind: OpencodeResourceKind, action: string): DomainError {
    return new DomainError(400, `Ação "${action}" não se aplica a ${kind}`, "OPENCODE_RESOURCE_UNSUPPORTED")
}

export async function createResource(input: ResourceCreateInput, actor: ResourceActor): Promise<ResourceMutationResultDto> {
    const key: ResourceKey = { kind: input.kind, scope: input.scope, name: input.name }
    return mutate(key, "criar", actor, (ctx, handler) => {
        if (!handler.create) throw unsupported(input.kind, "criar")
        return handler.create(ctx, input.name, input)
    }, secretKeys(input.secrets))
}

export async function updateResource(id: string, content: ResourceContentInput, actor: ResourceActor): Promise<ResourceMutationResultDto> {
    const key = parseResourceId(id)
    return mutate(key, "editar", actor, (ctx, handler) => {
        if (!handler.update) throw unsupported(key.kind, "editar")
        return handler.update(ctx, key.name, content)
    }, secretKeys(content.secrets))
}

export async function deleteResource(id: string, actor: ResourceActor): Promise<ResourceMutationResultDto> {
    const key = parseResourceId(id)
    return mutate(key, "excluir", actor, (ctx, handler) => handler.remove(ctx, key.name))
}

export async function setResourceEnabled(id: string, enabled: boolean, actor: ResourceActor): Promise<ResourceMutationResultDto> {
    const key = parseResourceId(id)
    return mutate(key, enabled ? "ligar" : "desligar", actor, (ctx, handler) => handler.setEnabled(ctx, key.name, enabled))
}

export async function installResource(input: ResourceInstallInput, actor: ResourceActor): Promise<ResourceMutationResultDto & { names: string[] }> {
    const key: ResourceKey = { kind: input.kind, scope: input.scope, name: input.name ?? input.source }
    const result = await mutate(key, "instalar", actor, (ctx, handler) => {
        if (!handler.install) throw unsupported(input.kind, "instalar")
        return handler.install(ctx, input)
    }, { origemInstalacao: input.source, ...secretKeys(input.secrets) })
    return { ...result, names: result.names ?? [] }
}

export async function setMcpSecretsById(id: string, secrets: McpSecretsInput, actor: ResourceActor): Promise<ResourceMutationResultDto> {
    const key = parseResourceId(id)
    if (key.kind !== "mcp") throw unsupported(key.kind, "segredos")
    return mutate(key, "segredos", actor, (ctx) => setMcpSecrets(ctx, key.name, secrets), secretKeys(secrets))
}

export async function testMcpById(id: string): Promise<McpTestResultDto> {
    const key = parseResourceId(id)
    if (key.kind !== "mcp") throw unsupported(key.kind, "testar")
    return guard(async () => testMcp(await openScope(key.scope), key.name))
}

/** Só os NOMES das variáveis/cabeçalhos alterados (auditoria sem valores). */
function secretKeys(secrets: McpSecretsInput | undefined): Record<string, unknown> {
    if (!secrets) return {}
    return { segredos: { environment: secrets.environment?.map((item) => item.key) ?? [], headers: secrets.headers?.map((item) => item.key) ?? [] } }
}

/** Itens com versão instalada x disponível (consulta sem cache). */
export async function checkResourceUpdates(kind: OpencodeResourceKind, scope: string): Promise<OpencodeResourceDto[]> {
    return (await listResources(kind, scope, { refresh: true })).filter((item) => item.version !== null)
}

/** Atualização individual (ids) ou em massa (`all`: todos os desatualizados). */
export async function updateResources(kind: OpencodeResourceKind, scope: string, input: ResourceUpdateManyInput, actor: ResourceActor): Promise<ResourceUpdateManyResultDto> {
    const handler = HANDLERS[kind]
    if (!handler.updateVersions) throw unsupported(kind, "atualizar")
    const items = await listResources(kind, scope, { refresh: true })
    const wanted = input.all ? items.filter((item) => item.version?.outdated) : items.filter((item) => input.ids?.includes(item.id))
    if (!input.all && wanted.length !== (input.ids?.length ?? 0)) throw new DomainError(404, "Algum dos itens não foi encontrado neste escopo", "OPENCODE_RESOURCE_NOT_FOUND")
    if (wanted.length === 0) return { updated: [], backupId: null, restartRequired: false }
    const result = await mutate({ kind, scope, name: wanted.map((item) => item.name).join(",") }, "atualizar", actor, (ctx) => handler.updateVersions!(ctx, wanted), { itens: wanted.map((item) => item.name) })
    return { updated: wanted.map((item) => ({ id: item.id, name: item.name })), backupId: result.backupId, restartRequired: result.restartRequired }
}
