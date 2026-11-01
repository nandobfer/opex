import type { AiUsage } from "@/lib/ai/stream"
import type { BudgetPreviewSettings, EstimateHoursSettings, TaskRefinementSettings, TaskSummarySettings, TaskTagsSettings, UnderstandTaskSettings } from "./schemas"

export type { AiAgentDto, AiModelDto, AiProviderStatusDto, AiSkillDto } from "@/lib/ai/providers"

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

/** Situação da skill escolhida como instruções do Agente Refinador. */
export type RefinementSkillStatus = "ok" | "not_found" | "empty" | "unavailable"

export interface RefinementSkillStateDto {
    status: RefinementSkillStatus
    /** Nome da skill no OpenCode (quando encontrada). */
    name: string | null
    /** Aviso para a tela (null quando `ok`). */
    message: string | null
}

export interface TaskRefinementSettingsDto {
    settings: TaskRefinementSettings
    /** Nada salvo ainda: valores iniciais do código. */
    isDefault: boolean
    availability: AiFeatureAvailability
    /** Situação da skill salva (null quando a origem das instruções é o texto). */
    skill: RefinementSkillStateDto | null
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

export interface MemoryUsageDto {
    /** `retrieval_count` (buscas). */
    consultas: number
    /** `injected_count` (entradas no contexto). */
    injecoes: number
    ultimaConsulta: string | null
    verificadaEm: string | null
    /** `stale_candidate`: candidata a esquecimento pelo consolidador. */
    esquecida: boolean
}

export interface MemoryDto {
    /** Central da memória, nas listas por central (`developer-central`). */
    centralId?: string
    /** Cliente da memória, nas listas por cliente (`*-client-specific`). */
    clientId?: string
    /** Id da memória no Engramind (`m_…`). */
    id: string
    texto: string
    /** Título do Redator do Engramind; enquanto ele não responde, a primeira frase do texto. */
    resumo: string
    /** O Redator ainda não respondeu (`title_state: pending`): a linha mostra o resumo carregando. */
    resumoPendente: boolean
    categoria: string
    /** `permanent` no Engramind (entra primeiro no contexto). */
    fixada: boolean
    /** `false` = arquivada no Engramind (fora do contexto). */
    ativa: boolean
    /** Versão lida (vai em `expected_version` ao editar). */
    versao: number
    autor: string | null
    /** Escrita pelo dono (o agente edita, mas não exclui nem inativa sem pedido dele). */
    doDono: boolean
    /** Origem da memória (Mentor, um agente sozinho...); `null` quando escrita pelo dono. */
    origin?: AgentMemoryOrigin | null
    criadaEm: string
    atualizadaEm: string
    /** Uso no Engramind (rede de memórias, OPE-109); os contadores chegam em lote e podem atrasar. */
    uso?: MemoryUsageDto
}

export interface MemoryMutationResult {
    memoria: MemoryDto
    /** O texto já existia na lista: nada foi gravado e a memória existente voltou. */
    duplicada?: boolean
    /** Memórias parecidas da mesma lista (prefira editar a duplicar). */
    similares?: { id: string; resumo: string; similaridade: number }[]
}

/** Metadados das telas de memórias (limites, categorias, pendência da migração e saúde do contexto). */
export interface MemoriesMetaDto {
    textMin: number
    textMax: number
    categories: { key: string; label: string }[]
    /** Nenhuma importação concluída ainda: "Migração de memórias pendente". */
    migrationPending: boolean
    availability: { unavailable: boolean; since: string | null; lastOkAt: string | null; reason: string | null }
    /** Memórias fora do texto completo do contexto (faixa de títulos + overflow), por agente e combinação de canais. */
    outside: { consumer: string; channels: string[]; outside: number }[]
    /** Erro ao ler o Engramind (sem conexão, fora do ar). */
    error: string | null
}
