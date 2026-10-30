import type { AiFeatureAvailability } from "@/features/ai/types"
import type { MentorLevel, MentorRunStatus, MentorSource, MentorTarget, MentorUserTrigger } from "./constants"
import type { MentorSettings } from "./schemas"

/** DTOs do Agente Mentor (módulo puro). */

export interface MentorSettingsDto {
    settings: MentorSettings
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
}

/** Proposta do redator: a ação, a lista de destino (com a central, em `developer-central`) e o texto. */
export type MentorProposal = { action: "create" | "update"; memoryId: string | null; text: string; target: MentorTarget; centralId: string | null }

export interface MentorRunDto {
    id: string
    workbenchId: string
    centralId: string
    taskId: string
    taskCode: string
    taskTitle: string
    sources: MentorSource[]
    trigger: MentorUserTrigger | null
    userMessage: string | null
    lessonCount: number
    status: MentorRunStatus
    level: MentorLevel
    score: number | null
    threshold: number
    deciderReason: string | null
    /** Lista escolhida pelo Triador (ou a única ligada); `null` antes dele. */
    target: MentorTarget | null
    routerConfidence: number | null
    routerReason: string | null
    routerProbabilities: Record<string, number> | null
    writerAction: "create" | "update" | "skip" | null
    writerReason: string | null
    sanitizerReason: string | null
    proposal: MentorProposal | null
    memoryId: string | null
    error: string | null
    costUsd: number
    durationMs: number | null
    createdAt: string
    finishedAt: string | null
}
