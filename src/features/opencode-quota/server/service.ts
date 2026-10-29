import { getIntegrationConfig } from "@/lib/integrations/config"
import { integrationDebug } from "@/lib/integrations/debug"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { OPENCODE_QUOTA_UPDATED_EVENT, QUOTA_RPC_MESSAGES, type QuotaRefreshReason } from "../constants"
import { keepLastGoodWindows, normalizeQuotaSnapshot, quotaHash } from "../logic"
import { quotaRpcOutputSchema, quotaSnapshotSchema } from "../schemas"
import type { OpencodeQuotaDto, OpencodeQuotaState } from "../types"
import { callQuotaRpc, type QuotaRpcCaller } from "./rpc"

/**
 * Pede a quota ao plugin `opencode-quota` pelo RPC `slkiser.opencode-quota` (`refresh`), o mesmo
 * canal do TUI: funciona sem TUI aberto, e o plugin decide quando consultar cada provedor. Sem
 * reserva pelo host. Guarda o último resultado em memória; a rotina `opencode-quota-refresh` pede
 * com `poll` a cada minuto e só publica em tempo real quando o que a tela mostra muda. Provedor que
 * vem sem linhas mantém as janelas da última leitura boa (`keepLastGoodWindows`).
 */

const log = loggerFor({ feature: "opencode-quota" })
const debug = integrationDebug("ai_opencode")

type QuotaSource = "rpc"
const SOURCE_LABELS: Record<QuotaSource, string> = { rpc: "RPC do plugin" }

interface QuotaStore {
    snapshot: OpencodeQuotaDto | null
    hash: string | null
    /** Leitura em andamento por motivo: mesmo motivo reaproveita; `manual` espera o `poll` e roda o seu. */
    pending: Partial<Record<QuotaRefreshReason, Promise<OpencodeQuotaDto>>>
    /** Última leitura `ok` (já mesclada); falha do RPC não a apaga. */
    lastGood: OpencodeQuotaDto | null
    /** Origem da última leitura (só para o debug avisar quando troca). */
    source: QuotaSource | null
}

const globalStore = globalThis as typeof globalThis & { __opencodeQuota?: QuotaStore }
const store = (): QuotaStore => (globalStore.__opencodeQuota ??= { snapshot: null, hash: null, pending: {}, lastGood: null, source: null })

let rpc: QuotaRpcCaller = callQuotaRpc

/** Somente testes: troca a chamada ao RPC (e zera a memória). */
export function setQuotaRpcForTests(next: QuotaRpcCaller | null): void {
    rpc = next ?? callQuotaRpc
    globalStore.__opencodeQuota = undefined
}

const failure = (state: Exclude<OpencodeQuotaState, "ok">, message: string): OpencodeQuotaDto => ({ state, message, exportedAt: null, checkedAt: new Date().toISOString(), providers: [] })

interface QuotaRead {
    dto: OpencodeQuotaDto
    /** Origem do conteúdo lido; `null` quando nem chegou a ler. */
    source: QuotaSource | null
}

async function readQuota(reason: QuotaRefreshReason): Promise<QuotaRead> {
    const config = await getIntegrationConfig("ai_opencode")
    if (!config.baseUrl?.trim()) return { dto: failure("unconfigured", "Configure a integração OpenCode para ver a quota."), source: null }
    let result: Awaited<ReturnType<QuotaRpcCaller>>
    try {
        result = await rpc(reason)
    } catch (error) {
        log.warn({ err: error }, "falha ao chamar o RPC da quota")
        return { dto: failure("error", QUOTA_RPC_MESSAGES.network), source: null }
    }
    if (!result.ok) {
        log.debug({ kind: result.kind, reason, detail: result.message }, "RPC da quota falhou")
        return { dto: failure(result.kind === "unavailable" ? "missing" : "error", QUOTA_RPC_MESSAGES[result.kind]), source: null }
    }
    const output = quotaRpcOutputSchema.safeParse(result.output)
    const parsed = quotaSnapshotSchema.safeParse(output.success ? output.data.snapshot : undefined)
    if (!parsed.success) {
        const snapshot = output.success ? output.data.snapshot : undefined
        const version = snapshot && typeof snapshot === "object" && "version" in snapshot ? String((snapshot as { version: unknown }).version) : "?"
        return { dto: failure("error", `Formato da quota do opencode-quota não reconhecido (versão ${version}).`), source: "rpc" }
    }
    return { dto: normalizeQuotaSnapshot(parsed.data, new Date()), source: "rpc" }
}

async function applyRead(reason: QuotaRefreshReason): Promise<OpencodeQuotaDto> {
    const state = store()
    const read = await readQuota(reason)
    if (read.source && read.source !== state.source) {
        debug.info(`Quota do OpenCode lida do ${SOURCE_LABELS[read.source]}`)
        state.source = read.source
    }
    const dto = keepLastGoodWindows(state.lastGood, read.dto)
    if (dto.state === "ok") state.lastGood = dto
    const hash = quotaHash(dto)
    const changed = hash !== state.hash
    state.snapshot = dto
    state.hash = hash
    if (changed) {
        if (dto.state === "ok") debug.info(`Quota do OpenCode atualizada: ${dto.providers.length} provedor(es) com dados`)
        else debug.warn(`Quota do OpenCode: ${dto.message}`)
        log.info({ state: dto.state, providers: dto.providers.length, source: read.source, reason }, "quota do OpenCode mudou")
        await publishAppEvent(OPENCODE_QUOTA_UPDATED_EVENT, { checkedAt: dto.checkedAt }).catch(() => undefined)
    }
    return dto
}

/**
 * Pede a quota ao plugin e publica se mudou. Leituras simultâneas com o mesmo motivo usam uma
 * chamada só; um `manual` que chega com um `poll` em andamento espera-o e roda o seu.
 */
export function refreshOpencodeQuota({ reason = "poll" }: { reason?: QuotaRefreshReason } = {}): Promise<OpencodeQuotaDto> {
    const state = store()
    const current = state.pending[reason]
    if (current) return current
    const before = reason === "manual" ? state.pending.poll : undefined
    const next = (async () => {
        if (before) await before.catch(() => undefined)
        return applyRead(reason)
    })().finally(() => {
        if (state.pending[reason] === next) delete state.pending[reason]
    })
    state.pending[reason] = next
    return next
}

/** Último resultado em memória; sem nenhum ainda (ex.: após reiniciar), pede na hora (`poll`). */
export async function getOpencodeQuota(): Promise<OpencodeQuotaDto> {
    return store().snapshot ?? refreshOpencodeQuota()
}

/** Rotina `opencode-quota-refresh` (motivo `poll`). */
export async function runOpencodeQuotaRefresh(): Promise<string> {
    const dto = await refreshOpencodeQuota({ reason: "poll" })
    return dto.state === "ok" ? `${dto.providers.length} provedor(es) com dados` : (dto.message ?? dto.state)
}
