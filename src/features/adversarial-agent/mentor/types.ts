import type { AiFeatureAvailability } from "@/features/ai/types"
import type { MentorLevel, MentorRunStatus, MentorSource, MentorUserTrigger } from "./constants"
import type { MentorSettings } from "./schemas"
import type { AgentCentralOption } from "../types"

/** DTOs do Agente Mentor (módulo puro). */

export interface MentorSettingsDto {
    settings: MentorSettings
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
}

export interface MentorRunDto {
    id: string
    workbenchId: string
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
    writerAction: "create" | "update" | "skip" | null
    writerReason: string | null
    sanitizerReason: string | null
    proposal: { action: "create" | "update"; memoryId: string | null; text: string } | null
    memoryId: string | null
    error: string | null
    costUsd: number
    durationMs: number | null
    createdAt: string
    finishedAt: string | null
}

/** Página da lista `GET /api/adversarial/mentor/runs` (página do Agente Mentor e aba Execuções). */
export interface MentorRunListDto {
    items: MentorRunDto[]
    page: number
    limit: number
    total: number
    totalPages: number
    centrals: AgentCentralOption[]
}
