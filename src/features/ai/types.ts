import type { AiUsage } from "@/lib/ai/stream"
import type { BudgetPreviewSettings, EstimateHoursSettings, TaskRefinementSettings, TaskSummarySettings, UnderstandTaskSettings } from "./schemas"

export type { AiAgentDto, AiModelDto, AiProviderStatusDto } from "@/lib/ai/providers"

/** Pode ser usada agora? Sem `available`, `reason` explica (botão desabilitado com o motivo). */
export interface AiFeatureAvailability {
    available: boolean
    reason: string | null
}

export interface UnderstandTaskSettingsDto {
    settings: UnderstandTaskSettings
    /** Nada salvo ainda: valores iniciais do código. */
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
}

export interface TaskSummarySettingsDto {
    settings: TaskSummarySettings
    /** Nada salvo ainda: valores iniciais do código. */
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
}

export interface BudgetPreviewSettingsDto {
    settings: BudgetPreviewSettings
    /** Nada salvo ainda: valores iniciais do código. */
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
}

export interface EstimateHoursSettingsDto {
    settings: EstimateHoursSettings
    /** Nada salvo ainda: valores iniciais do código. */
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
}

export interface TaskRefinementSettingsDto {
    settings: TaskRefinementSettings
    /** Nada salvo ainda: valores iniciais do código. */
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
}

/** Linha do stream NDJSON de `POST /api/tasks/[id]/understand`. */
export type UnderstandTaskEvent =
    | { type: "start"; provider: string; model: string; agent: string | null }
    | { type: "delta"; text: string }
    | { type: "reasoning" }
    | { type: "tool"; id: string; name: string; state: "running" | "done" | "error" }
    | { type: "notice"; message: string }
    | { type: "done"; finishReason: string; usage: AiUsage; durationMs: number }
    | { type: "error"; message: string }

/** Linha do stream NDJSON de `POST /api/tasks/[id]/summary` (mesma forma de "Entender tarefas"). */
export type TaskSummaryEvent = UnderstandTaskEvent
