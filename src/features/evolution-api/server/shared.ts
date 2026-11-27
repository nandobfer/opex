
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import type { IntegrationUpdateInput } from "@nandobfer/integracoes"
import { EVOLUTION_INTEGRATION_ID, EVOLUTION_UPDATED_EVENT, type EvolutionUpdateType } from "../constants"

export const evolutionLog = loggerFor({ feature: "evolution-api" })

/** Grava campos da integração pelo serviço central (cifra os segredos e audita a integração). */
export async function saveEvolutionFields(
    input: IntegrationUpdateInput,
    actorId: string,
) {
    const { updateIntegration, IntegrationUpdateError } = await import("@/lib/integrations/server")
    try {
        return await updateIntegration(EVOLUTION_INTEGRATION_ID, input, actorId)
    } catch (error) {
        if (error instanceof IntegrationUpdateError) throw new DomainError(error.status, error.message, "INTEGRATION_UPDATE_FAILED")
        throw error
    }
}

/** Auditoria das ações na instância (nunca chave, segredo ou conteúdo de mensagem). */
export async function auditEvolution(actorId: string, entidadeId: string, acao: (typeof AcaoAuditoria)[keyof typeof AcaoAuditoria], depois?: Record<string, unknown>, antes?: Record<string, unknown>): Promise<void> {
    await dbConnect()
    await recordAudit({ userId: actorId, entidade: "EvolutionApi", entidadeId, acao, depois, antes })
}

export { AcaoAuditoria }

export function publishEvolution(type: EvolutionUpdateType, instance: string | null): Promise<void> {
    return publishAppEvent(EVOLUTION_UPDATED_EVENT, { type, instance })
}
