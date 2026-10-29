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
}

export const CONNECTION_PROBE_TIMEOUT_MS = 8_000
export const CONNECTION_PROBE_CACHE_MS = 15_000

const probes = new Map<AiProviderId, { at: number; result: Promise<AiProviderConnection> }>()
const refreshing = new Set<AiProviderId>()

export function resetAiConnectionProbes(): void {
    probes.clear()
    refreshing.clear()
}

async function probe(providerId: AiProviderId): Promise<void> {
    const signal = AbortSignal.timeout(CONNECTION_PROBE_TIMEOUT_MS)
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

async function probeNow(providerId: AiProviderId): Promise<AiProviderConnection> {
    try {
        await probe(providerId)
        logger.warn({ providerId }, "[ai] Status gravado dizia desconectado, mas o provedor respondeu: status desatualizado")
        refreshStatus(providerId)
        return { configured: true, connected: true, detail: null }
    } catch (error) {
        const detail = error instanceof AiProviderError ? error.message : describeFetchError(error)
        return { configured: true, connected: false, detail: detail.slice(0, 300) }
    }
}

export async function confirmAiProviderConnection(providerId: AiProviderId): Promise<AiProviderConnection> {
    const status = (await getAiProviderStatuses()).find((item) => item.id === providerId)
    if (!status?.configured) return { configured: false, connected: false, detail: null }
    if (status.connected) return { configured: true, connected: true, detail: null }
    const hit = probes.get(providerId)
    if (hit && Date.now() - hit.at < CONNECTION_PROBE_CACHE_MS) return hit.result
    const result = probeNow(providerId)
    probes.set(providerId, { at: Date.now(), result })
    return result
}
