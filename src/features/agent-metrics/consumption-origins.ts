import { ADVERSARIAL_CONSUMPTION_ORIGIN } from "@/features/adversarial-agent/constants"
import { AGENTIC_CONSUMPTION_ORIGIN } from "@/features/agentic/constants"
import { TASK_SUMMARY_CONSUMPTION_ORIGIN, TASK_TAGS_CONSUMPTION_ORIGIN } from "@/features/ai/constants"
import { BUDGET_PREVIEW_CONSUMPTION_ORIGIN, ESTIMATE_HOURS_CONSUMPTION_ORIGIN } from "@/features/orcamentos/constants"
import { PR_REVIEW_CONSUMPTION_ORIGIN } from "@/features/pr-review/constants"
import { REFINEMENT_CONSUMPTION_ORIGIN } from "@/features/refinement/constants"
import {
    MENTOR_DECISION_CONSUMPTION_ORIGIN,
    MENTOR_DIGEST_CONSUMPTION_ORIGIN,
    MENTOR_REORG_ROUTER_CONSUMPTION_ORIGIN,
    MENTOR_REORG_WRITER_CONSUMPTION_ORIGIN,
    MENTOR_ROUTER_CONSUMPTION_ORIGIN,
    MENTOR_WRITER_CONSUMPTION_ORIGIN,
} from "@/features/adversarial-agent/mentor/constants"
import { ARCHITECT_CONSUMPTION_ORIGIN } from "@/features/architect-agent/constants"
import { MADDOX_CLIENT_CONSUMPTION_ORIGIN, MADDOX_CLIENT_TITLE_CONSUMPTION_ORIGIN, MADDOX_CONSUMPTION_ORIGIN, MADDOX_TITLE_CONSUMPTION_ORIGIN } from "@/features/maddox-agent/constants"
import { OPEX_CLIENT_CONSUMPTION_ORIGIN, OPEX_CLIENT_TITLE_CONSUMPTION_ORIGIN, OPEX_CONSUMPTION_ORIGIN, OPEX_TITLE_CONSUMPTION_ORIGIN } from "@/features/opex-agent/constants"
import { ROUTINE_CHAT_CONSUMPTION_ORIGIN, ROUTINE_CHAT_TITLE_CONSUMPTION_ORIGIN } from "@/features/routine-agents/chat"
import { ROUTINE_CONSUMPTION_ORIGIN, ROUTINE_PROVISIONING_ORIGIN } from "@/features/routine-agents/constants"
import { SECRETARY_ANALYSIS_CONSUMPTION_ORIGIN, SECRETARY_CONSUMPTION_ORIGIN, SECRETARY_DECISION_CONSUMPTION_ORIGIN } from "@/features/secretary-agent/constants"
import type { AgentId } from "./catalog"

/**
 * Origens de `ai_consumption_logs` de cada agente (OPE-205): base da **Taxa de cache** da Visão geral. A simulação do
 * Secretário fica fora, como na métrica de custo dele.
 */
export const AGENT_CONSUMPTION_ORIGINS: Readonly<Record<AgentId, readonly string[]>> = {
    opex: [OPEX_CONSUMPTION_ORIGIN, OPEX_TITLE_CONSUMPTION_ORIGIN, OPEX_CLIENT_CONSUMPTION_ORIGIN, OPEX_CLIENT_TITLE_CONSUMPTION_ORIGIN],
    maddox: [MADDOX_CONSUMPTION_ORIGIN, MADDOX_TITLE_CONSUMPTION_ORIGIN, MADDOX_CLIENT_CONSUMPTION_ORIGIN, MADDOX_CLIENT_TITLE_CONSUMPTION_ORIGIN],
    orcamentista: [BUDGET_PREVIEW_CONSUMPTION_ORIGIN, ESTIMATE_HOURS_CONSUMPTION_ORIGIN],
    catalogador: [TASK_SUMMARY_CONSUMPTION_ORIGIN, TASK_TAGS_CONSUMPTION_ORIGIN],
    refinador: [REFINEMENT_CONSUMPTION_ORIGIN],
    desenvolvedor: [AGENTIC_CONSUMPTION_ORIGIN],
    arquiteto: [ARCHITECT_CONSUMPTION_ORIGIN],
    adversario: [ADVERSARIAL_CONSUMPTION_ORIGIN],
    revisor: [PR_REVIEW_CONSUMPTION_ORIGIN],
    mentor: [
        MENTOR_DECISION_CONSUMPTION_ORIGIN,
        MENTOR_ROUTER_CONSUMPTION_ORIGIN,
        MENTOR_DIGEST_CONSUMPTION_ORIGIN,
        MENTOR_WRITER_CONSUMPTION_ORIGIN,
        MENTOR_REORG_ROUTER_CONSUMPTION_ORIGIN,
        MENTOR_REORG_WRITER_CONSUMPTION_ORIGIN,
    ],
    rotineiros: [ROUTINE_CONSUMPTION_ORIGIN, ROUTINE_CHAT_CONSUMPTION_ORIGIN, ROUTINE_CHAT_TITLE_CONSUMPTION_ORIGIN, ROUTINE_PROVISIONING_ORIGIN],
    secretario: [SECRETARY_CONSUMPTION_ORIGIN, SECRETARY_DECISION_CONSUMPTION_ORIGIN, SECRETARY_ANALYSIS_CONSUMPTION_ORIGIN],
}

/** O evento `ai-consumption-updated` (`{ provider, origin }`) é de uma origem do agente? */
export function consumptionConcernsAgent(agent: AgentId, payload: unknown): boolean {
    const origin = typeof payload === "object" && payload !== null ? (payload as { origin?: unknown }).origin : undefined
    return typeof origin === "string" && AGENT_CONSUMPTION_ORIGINS[agent].includes(origin)
}
