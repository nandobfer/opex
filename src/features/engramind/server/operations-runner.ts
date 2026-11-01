import { createHash } from "node:crypto"
import { DomainError } from "@/lib/api/route"
import { AUDIT_MAX_PAGES } from "../constants"
import { findEngramindOperation, type EngramindOperation } from "../operations"
import { batchLimitError, importInputSchema } from "../schemas/import"
import { buildSettingsSchema } from "../schemas/settings"
import type { AuditEvent, ChannelSettingsView, ImportResult, IssuedToken, SettingMeta } from "../types"
import { engramindCall } from "./client"
import { fetchWhoami, resetWhoamiCache } from "./connection"
import { AcaoAuditoria, auditEngramind, engramindLog, publishEngramind } from "./shared"

/**
 * Executa uma operação do catálogo (`../operations.ts`) no Engramind: valida a entrada, aplica as
 * regras do Opex (configurações pelo metadado, token próprio protegido, auditoria por período),
 * chama o Engramind, audita a mutação no Opex e avisa as telas. Usado pelas rotas e pelo Agente Opex.
 */

function parseInput<I>(operation: EngramindOperation<I>, raw: unknown): I {
    const parsed = operation.input.safeParse(raw ?? {})
    if (!parsed.success) {
        const issue = parsed.error.issues[0]
        throw new DomainError(400, issue ? `${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}` : "Dados inválidos", "VALIDATION_ERROR", parsed.error.issues)
    }
    return parsed.data
}

function acaoOf(operation: EngramindOperation): (typeof AcaoAuditoria)[keyof typeof AcaoAuditoria] {
    if (operation.method === "DELETE" || operation.id === "revoke_token") return AcaoAuditoria.EXCLUIR
    if (/^(create|issue|subscribe)/.test(operation.id)) return AcaoAuditoria.CRIAR
    if (/^(test|retry|reembed)/.test(operation.id)) return AcaoAuditoria.EXECUTAR
    if (operation.id === "move_memory") return AcaoAuditoria.MOVER
    return AcaoAuditoria.ATUALIZAR
}

/** Entrada sem segredos e sem textos longos, para a auditoria. */
function auditInput(operation: EngramindOperation, input: unknown): Record<string, unknown> {
    const shown = (operation.redact ? operation.redact(input as never) : input) as Record<string, unknown>
    return Object.fromEntries(Object.entries(shown ?? {}).map(([key, value]) => [key, typeof value === "string" && value.length > 300 ? `${value.slice(0, 300)}…` : value]))
}

async function validateSettings(map: Record<string, unknown>): Promise<void> {
    const view = await engramindCall<{ settings: SettingMeta[] }>("GET", { path: "/v1/settings" })
    const secrets = view.settings.filter((meta) => meta.secret).map((meta) => meta.key)
    const secretKey = Object.keys(map).find((key) => secrets.includes(key))
    if (secretKey) throw new DomainError(400, `${secretKey} é um segredo: grave pela aba Provedores.`, "ENGRAMIND_SETTING_IS_SECRET")
    const parsed = buildSettingsSchema(view.settings).safeParse(map)
    if (!parsed.success) {
        const issue = parsed.error.issues[0]
        throw new DomainError(400, issue ? `${issue.path.join(".")}: ${issue.message}` : "Configuração inválida", "VALIDATION_ERROR", parsed.error.issues)
    }
}

async function validateChannelSettings(channel: string, map: Record<string, unknown>): Promise<void> {
    const view = await engramindCall<ChannelSettingsView>("GET", { path: `/v1/channels/${encodeURIComponent(channel)}/settings` })
    const parsed = buildSettingsSchema(view.settings).safeParse(map)
    if (!parsed.success) {
        const issue = parsed.error.issues[0]
        throw new DomainError(400, issue ? `${issue.path.join(".")}: ${issue.message}` : "Configuração inválida", "VALIDATION_ERROR", parsed.error.issues)
    }
}

type GuardInput = { token?: string; scopes?: string[]; expires_at?: string | null; app?: string; disabled?: boolean }

/** A operação pode cortar o acesso do próprio Opex (decide se vale consultar o `whoami`). */
function touchesOwnAccess(operation: EngramindOperation, input: GuardInput): boolean {
    if (operation.id === "revoke_token" || operation.id === "delete_app") return true
    if (operation.id === "update_token") return Boolean(input.scopes) || (input.expires_at !== undefined && input.expires_at !== null)
    return operation.id === "update_app" && input.disabled === true
}

/**
 * O acesso do próprio Opex não é cortado pela tela, pelo proxy nem pelo agente: o token dele não é
 * revogado, rebaixado nem ganha validade, e o app dele não é desativado nem excluído.
 */
async function guardOwnToken(operation: EngramindOperation, input: GuardInput): Promise<void> {
    if (!touchesOwnAccess(operation, input)) return
    const whoami = await fetchWhoami().catch(() => null)
    if (!whoami) return
    if (operation.id === "delete_app" || operation.id === "update_app") {
        if (input.app !== whoami.app.slug && input.app !== whoami.app.id) return
        throw new DomainError(409, `Este é o app que o Opex usa no Engramind: troque o token na aba Conexão por um de outro app antes de ${operation.id === "delete_app" ? "excluí-lo" : "desativá-lo"}.`, "ENGRAMIND_OWN_TOKEN")
    }
    if (input.token !== whoami.token_id) return
    if (operation.id === "revoke_token") throw new DomainError(409, "Este é o token que o Opex usa no Engramind: troque o token na aba Conexão antes de revogá-lo.", "ENGRAMIND_OWN_TOKEN")
    if (input.scopes && !["read", "write", "delete"].every((scope) => input.scopes!.includes(scope))) throw new DomainError(409, "Este é o token que o Opex usa no Engramind: ele precisa continuar com read+write+delete.", "ENGRAMIND_OWN_TOKEN")
    if (input.expires_at) throw new DomainError(409, "Este é o token que o Opex usa no Engramind: ele não pode ganhar validade (o Opex perderia o acesso ao vencer).", "ENGRAMIND_OWN_TOKEN")
}

/** Auditoria do Engramind com o recorte por período feito no Opex (o Engramind só pagina por cursor). */
export async function auditWithPeriod(input: { entity?: string; entity_id?: string; action?: string; since?: string; until?: string; cursor?: string; limit?: number }): Promise<{ events: AuditEvent[]; next_cursor: string | null; truncated?: boolean }> {
    const base = { entity: input.entity, entity_id: input.entity_id, action: input.action }
    if (!input.since && !input.until) return engramindCall("GET", { path: "/v1/audit", query: { ...base, cursor: input.cursor, limit: input.limit } })
    const since = input.since ? Date.parse(input.since) : -Infinity
    const until = input.until ? Date.parse(input.until) : Infinity
    const events: AuditEvent[] = []
    let cursor: string | null | undefined = input.cursor
    for (let page = 0; page < AUDIT_MAX_PAGES; page++) {
        const result: { events: AuditEvent[]; next_cursor: string | null } = await engramindCall("GET", { path: "/v1/audit", query: { ...base, cursor: cursor ?? undefined, limit: 200 } })
        let passed = false
        for (const event of result.events) {
            const at = Date.parse(event.at)
            if (at < since) {
                passed = true
                break
            }
            if (at <= until) events.push(event)
        }
        if (passed || !result.next_cursor) return { events, next_cursor: null }
        cursor = result.next_cursor
    }
    return { events, next_cursor: null, truncated: true }
}

export async function runEngramindOperation(id: string, rawInput: unknown, actorId: string): Promise<unknown> {
    const operation = findEngramindOperation(id)
    if (!operation) throw new DomainError(404, `Operação do Engramind desconhecida: ${id}`, "ENGRAMIND_OPERATION_NOT_FOUND")
    const input = parseInput(operation, rawInput) as Record<string, unknown>
    if (operation.id === "get_audit") return auditWithPeriod(input)
    if (operation.id === "update_settings") await validateSettings(input.settings as Record<string, unknown>)
    if (operation.id === "update_channel_settings") await validateChannelSettings(String(input.channel), input.settings as Record<string, unknown>)
    await guardOwnToken(operation, input as GuardInput)

    const result = await engramindCall(operation.method, operation.request(input), { sensitiveBody: Boolean(operation.redact) })
    if (operation.risk === "read") return result

    const depois = auditInput(operation, input)
    if (operation.id === "issue_token") depois.prefix = (result as IssuedToken | null)?.token?.prefix ?? null
    await auditEngramind(actorId, operation.id, acaoOf(operation), depois)
    engramindLog.info({ operation: operation.id, actorId }, "[engramind] operação executada")
    if (operation.area === "tokens" || operation.area === "apps" || operation.area === "agents") resetWhoamiCache()
    if (operation.event) {
        const keys = operation.id === "update_settings" || operation.id === "update_channel_settings" ? Object.keys(input.settings as Record<string, unknown>) : operation.id === "set_secret" ? [String(input.key)] : undefined
        await publishEngramind({ type: operation.event, channel: typeof input.channel === "string" ? input.channel : null, keys })
    }
    return result
}

/**
 * Chave de idempotência da importação: o mesmo canal com o mesmo conteúdo nunca duplica. Única para as
 * duas rotas de importação (página /engramind e aba Migração de memórias).
 */
export function importIdempotencyKey(input: { channel: string; memories: readonly unknown[] }): string {
    return `opex-import-${createHash("sha256").update(`${input.channel}\n${JSON.stringify(input.memories)}`).digest("hex").slice(0, 48)}`
}

/** `import_memories`: valida tudo, recusa acima de `limits.max_batch` antes do envio e audita a contagem. */
export async function importEngramindMemories(raw: unknown, actorId: string): Promise<ImportResult> {
    const parsed = importInputSchema.safeParse(raw)
    if (!parsed.success) {
        const issue = parsed.error.issues[0]
        throw new DomainError(400, issue ? `${issue.path.join(".")}: ${issue.message}` : "Arquivo inválido", "VALIDATION_ERROR", parsed.error.issues)
    }
    const input = parsed.data
    const view = await engramindCall<{ settings: SettingMeta[] }>("GET", { path: "/v1/settings", query: { key: "limits.max_batch" } })
    const max = view.settings.find((meta) => meta.key === "limits.max_batch")?.value
    const tooLarge = batchLimitError(input.memories.length, typeof max === "number" ? max : null)
    if (tooLarge) throw new DomainError(400, tooLarge, "ENGRAMIND_BATCH_TOO_LARGE", { max, received: input.memories.length })
    const result = await engramindCall<ImportResult>("POST", { path: "/v1/memories/import", body: input }, { idempotencyKey: importIdempotencyKey(input) })
    await auditEngramind(actorId, "import_memories", AcaoAuditoria.IMPORTAR, { channel: input.channel, created: result.created.length, duplicates: result.duplicates.length })
    engramindLog.info({ channel: input.channel, created: result.created.length, duplicates: result.duplicates.length }, "[engramind] memórias importadas")
    await publishEngramind({ type: "memory.created", channel: input.channel })
    return result
}
