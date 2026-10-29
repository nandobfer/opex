import { createHostRunner, type HostRunner } from "@/features/local-docker/server/shell"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { integrationDebug } from "@/lib/integrations/debug"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { quotaReadCommand } from "../commands"
import { OPENCODE_QUOTA_EXPORT_MARKER, OPENCODE_QUOTA_MISSING_MARKER, OPENCODE_QUOTA_SNAPSHOT_MARKER, OPENCODE_QUOTA_UPDATED_EVENT } from "../constants"
import { keepLastGoodWindows, normalizeQuotaExport, quotaHash, snapshotFreshAt } from "../logic"
import { quotaExportSchema } from "../schemas"
import type { OpencodeQuotaDto, OpencodeQuotaState } from "../types"

/**
 * Lê no host do OpenCode a quota do plugin `opencode-quota` (sem consultar provedores): o snapshot
 * (`show --json`, a última quota conhecida de cada provedor, como o TUI) ou, na falta dele, o arquivo
 * de export. Guarda o último resultado em memória; a rotina `opencode-quota-refresh` relê a cada 5
 * minutos e só publica em tempo real quando o que a tela mostra muda. Provedor que falha numa leitura
 * mantém as janelas da última leitura boa (`keepLastGoodWindows`), guardada em `lastGood`.
 */

const log = loggerFor({ feature: "opencode-quota" })
const debug = integrationDebug("ai_opencode")
const READ_TIMEOUT_MS = 20_000

interface QuotaStore {
    snapshot: OpencodeQuotaDto | null
    hash: string | null
    pending: Promise<OpencodeQuotaDto> | null
    /** Última leitura `ok` do arquivo (já mesclada); falha ao ler o arquivo não a apaga. */
    lastGood: OpencodeQuotaDto | null
    /** Origem da última leitura do arquivo (só para o debug avisar quando troca). */
    source: QuotaSource | null
}

type QuotaSource = "snapshot" | "export"
const SOURCE_LABELS: Record<QuotaSource, string> = { snapshot: "snapshot do plugin", export: "arquivo de export (reserva)" }

const globalStore = globalThis as typeof globalThis & { __opencodeQuota?: QuotaStore }
const store = (): QuotaStore => (globalStore.__opencodeQuota ??= { snapshot: null, hash: null, pending: null, lastGood: null, source: null })

let runner: HostRunner = createHostRunner(debug)

/** Somente testes: troca o executor no host. */
export function setQuotaHostRunnerForTests(next: HostRunner | null): void {
    runner = next ?? createHostRunner(debug)
    globalStore.__opencodeQuota = undefined
}

const failure = (state: Exclude<OpencodeQuotaState, "ok">, message: string): OpencodeQuotaDto => ({ state, message, exportedAt: null, checkedAt: new Date().toISOString(), providers: [] })

/** Separa a linha de origem do conteúdo; saída sem ela é tratada como o arquivo de export. */
function splitSource(output: string): { source: QuotaSource; body: string } {
    const newline = output.indexOf("\n")
    const first = (newline < 0 ? output : output.slice(0, newline)).trim()
    const rest = newline < 0 ? "" : output.slice(newline + 1).trim()
    if (first === OPENCODE_QUOTA_SNAPSHOT_MARKER) return { source: "snapshot", body: rest }
    if (first === OPENCODE_QUOTA_EXPORT_MARKER) return { source: "export", body: rest }
    return { source: "export", body: output }
}

interface QuotaRead {
    dto: OpencodeQuotaDto
    /** Origem do conteúdo lido; `null` quando nem chegou a ler. */
    source: QuotaSource | null
}

async function readQuota(): Promise<QuotaRead> {
    const fail = (state: Exclude<OpencodeQuotaState, "ok">, message: string, source: QuotaSource | null = null): QuotaRead => ({ dto: failure(state, message), source })
    const config = await getIntegrationConfig("ai_opencode")
    if (!config.baseUrl?.trim()) return fail("unconfigured", "Configure a integração OpenCode para ver a quota.")
    let command: string
    try {
        command = quotaReadCommand(config.quotaExportPath)
    } catch (error) {
        return fail("error", error instanceof Error ? error.message : String(error))
    }
    let output: string
    try {
        const result = await runner(command, READ_TIMEOUT_MS, { quiet: true, retryOnLost: true })
        if (result.exitCode !== 0) return fail("error", `Não foi possível ler o arquivo de quota no host do OpenCode${result.output ? `: ${result.output.split("\n")[0]}` : ""}`)
        output = result.output.trim()
    } catch (error) {
        return fail("error", error instanceof Error ? error.message : "Não foi possível falar com o OpenCode")
    }
    const { source, body } = splitSource(output)
    if (body === OPENCODE_QUOTA_MISSING_MARKER) return fail("missing", "O arquivo de quota do opencode-quota não existe: ligue o export no plugin.", source)
    let json: unknown
    try {
        json = JSON.parse(body)
    } catch {
        return fail("error", "O arquivo de quota do opencode-quota não é um JSON válido.", source)
    }
    const parsed = quotaExportSchema.safeParse(json)
    if (!parsed.success) {
        const version = json && typeof json === "object" && "version" in json ? String((json as { version: unknown }).version) : "?"
        return fail("error", `Formato do arquivo de quota não reconhecido (versão ${version}).`, source)
    }
    // O `show --json` data o documento com a hora da leitura: o "Desatualizado" olha a verificação mais nova.
    const data = source === "snapshot" ? { ...parsed.data, exportedAt: snapshotFreshAt(parsed.data) } : parsed.data
    return { dto: normalizeQuotaExport(data, new Date()), source }
}

/** Relê a quota (leituras simultâneas compartilham o mesmo comando) e publica se mudou. */
export function refreshOpencodeQuota(): Promise<OpencodeQuotaDto> {
    const state = store()
    if (state.pending) return state.pending
    state.pending = (async () => {
        const read = await readQuota()
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
            log.info({ state: dto.state, providers: dto.providers.length, source: read.source }, "quota do OpenCode mudou")
            await publishAppEvent(OPENCODE_QUOTA_UPDATED_EVENT, { checkedAt: dto.checkedAt }).catch(() => undefined)
        }
        return dto
    })().finally(() => {
        state.pending = null
    })
    return state.pending
}

/** Último resultado em memória; sem nenhum ainda (ex.: após reiniciar), lê na hora. */
export async function getOpencodeQuota(): Promise<OpencodeQuotaDto> {
    return store().snapshot ?? refreshOpencodeQuota()
}

/** Rotina `opencode-quota-refresh`. */
export async function runOpencodeQuotaRefresh(): Promise<string> {
    const dto = await refreshOpencodeQuota()
    return dto.state === "ok" ? `${dto.providers.length} provedor(es) com dados` : (dto.message ?? dto.state)
}
