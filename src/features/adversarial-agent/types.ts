import type { AiFeatureAvailability } from "@/features/ai/types"
import type { AdversarialDecision, AdversarialLevel, AdversarialReviewState, FindingSeverity } from "./constants"
import type { AdversarialSettings } from "./schemas"
import type { EvaluatedFinding, PreviousStatus } from "./verdict"

export interface AdversarialSettingsDto {
    settings: AdversarialSettings
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
}

export type { AdversarialReviewState }

export type AdversarialFindingDto = EvaluatedFinding

/** Uma rodada do adversário (lista da aba Revisões e mesa). */
export interface AdversarialReviewDto {
    id: string
    workbenchId: string
    centralId: string
    taskId: string
    taskCode: string
    taskTitle: string
    cycle: number
    round: number
    level: AdversarialLevel
    state: AdversarialReviewState
    decision: AdversarialDecision | null
    /** Pausou por ter atingido o limite de rodadas (correção automática). */
    limitReached: boolean
    summary: string | null
    blocking: number
    counts: Record<FindingSeverity, number>
    error: string | null
    costUsd: number
    durationMs: number | null
    createdAt: string
    finishedAt: string | null
}

export interface AdversarialReviewDetailDto extends AdversarialReviewDto {
    findings: AdversarialFindingDto[]
    previous: PreviousStatus[]
    disputes: { id: string; reason: string }[]
    /** Achados desmarcados pelo usuário ao mandar corrigir. */
    excluded: string[]
    userText: string | null
    /** Texto completo do adversário na rodada. */
    report: string | null
}

/** Central (opção do filtro Central das páginas do Adversário e do Mentor). */
export interface AgentCentralOption {
    id: string
    projectName: string
}

/** Página da lista `GET /api/adversarial/reviews` (página do Agente Adversário e aba Revisões). */
export interface AdversarialReviewListDto {
    items: AdversarialReviewDto[]
    page: number
    limit: number
    total: number
    totalPages: number
    centrals: AgentCentralOption[]
}
