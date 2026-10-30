import type { AiUsage } from "@/lib/ai/stream"
import type { BudgetPreviewSettings, EstimateHoursSettings, TaskRefinementSettings, TaskSummarySettings, TaskTagsSettings, UnderstandTaskSettings } from "./schemas"

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

export interface TaskTagsSettingsDto {
    settings: TaskTagsSettings
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

/** Memória exibida na lista compacta de um agente. */
/**
 * Quem gerou a memória quando não foi o usuário direto (ex.: o Agente Mentor a partir de uma mesa).
 * Fica fora do texto: só identifica a origem na lista e na auditoria.
 */
export interface AgentMemoryOrigin {
    source: string
    /** Rótulo curto exibido na lista (ex.: "Mentor · OPE-12"). */
    label: string
}

export interface MemoryDto {
    /** Central da memória, nas listas por central (`developer-central`). */
    centralId?: string
    id: string
    texto: string
    resumo: string
    /** Mantido do Ciliar/crm (lá, memórias do contato); no Opex toda memória é escrita pelo dono ou pelo agente a pedido dele. */
    origem?: "agente" | "usuario"
    autor: string | null
    /** Origem da memória (ex.: gravada pelo Agente Mentor); `null` quando escrita pelo dono. */
    origin?: AgentMemoryOrigin | null
    criadaEm: string
    atualizadaEm: string
}

export interface MemoryMutationResult {
    memoria: MemoryDto
    /** `false` quando o Resumo de memórias estava indisponível e o texto foi salvo como escrito. */
    formatadaPorIa: boolean
}

export interface MemorySummarySettingsDto {
    settings: import("./schemas").MemorySummarySettings
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
}
