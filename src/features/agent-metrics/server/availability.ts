import type { AgentId } from "../catalog"

export interface AgentAvailability {
    available: boolean
    reason: string | null
}

const OK: AgentAvailability = { available: true, reason: null }

async function first(...checks: (() => Promise<{ availability: AgentAvailability }>)[]): Promise<AgentAvailability> {
    const results = await Promise.all(checks.map((check) => check().then((dto) => dto.availability)))
    // Agente que funde features: disponível se qualquer uma estiver; senão, o motivo da primeira.
    return results.find((item) => item.available) ?? results[0] ?? OK
}

/**
 * Disponibilidade do agente para o aviso da página (mesma regra da aba de configuração). Falha ao
 * consultar não mostra aviso: a página continua abrindo normalmente.
 */
export async function agentAvailability(agent: AgentId): Promise<AgentAvailability> {
    try {
        const settings = await import("@/features/ai/server/settings")
        switch (agent) {
            case "opex":
                return (await (await import("@/features/opex-agent/server/settings")).getOpexSettings()).availability
            case "maddox":
                return (await (await import("@/features/maddox-agent/server/settings")).getMaddoxSettings()).availability
            case "orcamentista":
                return first(settings.getBudgetPreviewSettings, settings.getEstimateHoursSettings)
            case "catalogador":
                return first(settings.getTaskSummarySettings, settings.getTaskTagsSettings)
            case "refinador":
                return (await settings.getTaskRefinementSettings()).availability
            case "desenvolvedor":
                return (await (await import("@/features/agentic/server/settings")).getAgenticSettings()).availability
            case "arquiteto":
                return (await (await import("@/features/architect-agent/server/settings")).getArchitectSettings()).availability
            case "adversario":
                return (await (await import("@/features/adversarial-agent/server/settings")).getAdversarialSettings()).availability
            case "revisor":
                return (await settings.getPrReviewSettings()).availability
            case "mentor":
                return (await (await import("@/features/adversarial-agent/server/mentor/settings")).getMentorSettings()).availability
        }
    } catch {
        return OK
    }
}
