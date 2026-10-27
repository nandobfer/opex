import type { AiFeatureAvailability } from "@/features/ai/types"
import type { AdversarialDecision, AdversarialLevel, FindingSeverity } from "./constants"
import type { AdversarialSettings } from "./schemas"
import type { EvaluatedFinding, PreviousStatus } from "./verdict"

export interface AdversarialSettingsDto {
    settings: AdversarialSettings
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
}

export type AdversarialReviewState = "running" | "done" | "failed" | "interrupted"

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
