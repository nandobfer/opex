import { describeFetchError } from "@/features/integrations/testers/types"
import { logger } from "@/lib/logger"
import { getAiProviderStatuses, listAiModels } from "./catalog"
import { AiProviderError } from "./errors"
import { getAiProvider, type AiProviderId } from "./providers"

/**
 * Conexão de um provedor de IA confirmada na hora (SOMENTE servidor). O status gravado vem do
 * último teste (manual ou da rotina periódica): uma falha passageira não pode bloquear as ações
 * até o próximo teste. Quando o gravado diz "desconectado", testa o provedor de verdade antes de
 * recusar e, se ele responder, regrava o status em segundo plano.
 */

export interface AiProviderConnection {
    configured: boolean
    connected: boolean
    /** Motivo real da falha (sem segredos) quando o teste na hora falhou. */
    detail: string | null
    /** O teste na hora estourou o limite (o provedor pode estar só lento). */
    timedOut?: boolean
}

export const CONNECTION_PROBE_TIMEOUT_MS = 8_000
/** Teste curto para telas de leitura (não seguram o carregamento). */
export const CONNECTION_READ_PROBE_TIMEOUT_MS = 2_000
/** Quanto vale um teste que passou; o que falhou vale bem menos, para a conexão que voltou valer logo. */
export const CONNECTION_PROBE_CACHE_MS = 15_000
export const CONNECTION_PROBE_FAILURE_CACHE_MS = 1_500

/** Por provedor + limite: chamadas simultâneas compartilham o teste em andamento. */
const probes = new Map<string, { settledAt: number | null; ok: boolean; result: Promise<AiProviderConnection> }>()
const refreshing = new Set<AiProviderId>()

export function resetAiConnectionProbes(): void {
    probes.clear()
    refreshing.clear()
}

async function probe(providerId: AiProviderId, signal: AbortSignal): Promise<void> {
    if (providerId === "opencode") {
        const { getOpencodeInfo } = await import("./opencode")
        await getOpencodeInfo(signal)
        return
    }
    await listAiModels(providerId, { fresh: true, signal })
}

/** Regrava o status com o teste completo (o mesmo do botão), sem bloquear quem pediu. */
function refreshStatus(providerId: AiProviderId): void {
    if (refreshing.has(providerId)) return
    refreshing.add(providerId)
    const { integrationId } = getAiProvider(providerId)
    void import("@/features/integrations/services/integration-test-runner")
        .then(({ runIntegrationTest }) => runIntegrationTest(integrationId, { source: "scheduler" }))
        .catch((error: unknown) => logger.warn({ err: error, integrationId }, "[ai] Falha ao regravar o status do provedor"))
        .finally(() => refreshing.delete(providerId))
}

async function probeNow(providerId: AiProviderId, timeoutMs: number): Promise<AiProviderConnection> {
    const signal = AbortSignal.timeout(timeoutMs)
    try {
        await probe(providerId, signal)
        logger.warn({ providerId }, "[ai] Status gravado dizia desconectado, mas o provedor respondeu: status desatualizado")
        refreshStatus(providerId)
        return { configured: true, connected: true, detail: null }
    } catch (error) {
        const detail = error instanceof AiProviderError ? error.message : describeFetchError(error)
        // O cliente do OpenCode embrulha o aborto em AiProviderError: o sinal é quem diz se estourou.
        const timedOut = signal.aborted || (error instanceof Error && error.name === "TimeoutError")
        return { configured: true, connected: false, detail: detail.slice(0, 300), timedOut }
    }
}

export async function confirmAiProviderConnection(providerId: AiProviderId, options: { timeoutMs?: number } = {}): Promise<AiProviderConnection> {
    const status = (await getAiProviderStatuses()).find((item) => item.id === providerId)
    if (!status?.configured) return { configured: false, connected: false, detail: null }
    if (status.connected) return { configured: true, connected: true, detail: null }
    const timeoutMs = options.timeoutMs ?? CONNECTION_PROBE_TIMEOUT_MS
    const key = `${providerId}:${timeoutMs}`
    const hit = probes.get(key)
    if (hit) {
        if (hit.settledAt === null) return hit.result
        if (Date.now() - hit.settledAt < (hit.ok ? CONNECTION_PROBE_CACHE_MS : CONNECTION_PROBE_FAILURE_CACHE_MS)) return hit.result
    }
    const entry: { settledAt: number | null; ok: boolean; result: Promise<AiProviderConnection> } = { settledAt: null, ok: false, result: probeNow(providerId, timeoutMs) }
    probes.set(key, entry)
    const result = await entry.result
    entry.settledAt = Date.now()
    entry.ok = result.connected
    return result
}
