import { TASK_PRIORITY_LABELS, TASK_TYPE_LABELS, TASK_TYPES } from "@/features/tasks/constants"
import { draftPreviewSchema, type DraftPreview } from "./schemas"

/**
 * Montagem do prompt da prévia/orçamento da tarefa (módulo PURO). A IA lê a descrição do cliente e
 * devolve um JSON com título, tipo, prioridade, especificação técnica, resumo e horas estimadas.
 * As horas são calibradas por estatísticas de horas já trabalhadas pelos agentes (injetadas no
 * prompt — sem ferramenta).
 */

export interface EstimateStat {
    /** Chave do tipo de tarefa (`TASK_TYPES`). */
    taskType: string
    label: string
    /** Média de horas por tarefa do tipo. */
    averageHours: number
    /** Quantidade de tarefas consideradas. */
    count: number
}

export interface EstimateStats {
    globalAverageHours: number
    totalTasks: number
    byType: EstimateStat[]
}

export interface BudgetPreviewInput {
    projectName: string
    description: string
    /** Texto de correção pedido pelo cliente (some quando não houver). */
    correction: string | null
}

const MAX_DESCRIPTION = 20_000

function clip(text: string, max = MAX_DESCRIPTION): string {
    const value = (text ?? "").trim()
    return value.length > max ? `${value.slice(0, max)}… (cortado)` : value
}

function formatHours(hours: number): string {
    return `${hours.toFixed(1)} h`
}

/** Bloco de contexto com as horas históricas dos agentes (calibra a estimativa). */
export function buildEstimateContext(stats: EstimateStats): string {
    if (stats.totalTasks === 0) {
        return "Ainda não há histórico de horas apontadas. Estime com base no seu conhecimento e em projetos semelhantes."
    }
    const lines = [
        `Média geral: ${formatHours(stats.globalAverageHours)} por tarefa (${stats.totalTasks} tarefa(s) no histórico).`,
        ...stats.byType.map((stat) => `${stat.label}: ${formatHours(stat.averageHours)} por tarefa (${stat.count}).`),
    ]
    return lines.join("\n")
}

/** Instruções de sistema da prévia (instruções configuradas + contrato de saída JSON). */
export function buildBudgetPreviewInstructions(instructions: string): string {
    const contract = [
        "Responda APENAS com um objeto JSON válido, sem texto antes ou depois e sem cercas de código, com exatamente estas chaves:",
        "- \"title\": string, um título curto e específico da tarefa;",
        `- "taskType": um de ${TASK_TYPES.map((type) => `"${type}"`).join(", ")} ou null quando não for possível classificar;`,
        '- "priority": "urgent", "high", "medium" ou "low";',
        '- "technicalSpec": string em Markdown, a especificação técnica do que deve ser feito;',
        '- "summary": string, um resumo de UMA linha (sem Markdown);',
        '- "estimatedHours": número de horas (aceita fração, ex.: 2.5), sua estimativa de esforço.',
    ].join("\n")
    return `${instructions.trim()}\n\n${contract}`
}

/** Prompt com a tarefa do cliente e o histórico de horas dos agentes. */
export function buildBudgetPreviewPrompt(input: BudgetPreviewInput, stats: EstimateStats): string {
    const parts = [
        "# Novo pedido do cliente",
        `Repositório: ${input.projectName}`,
        "## Descrição do cliente",
        clip(input.description),
        input.correction ? `## Correção solicitada\n${clip(input.correction, 4000)}` : "",
        `## Histórico de horas (agentes)\n${buildEstimateContext(stats)}`,
        "Interprete a descrição, gere a prévia e estime as horas de implementação usando o histórico como referência.",
    ]
    return parts.filter(Boolean).join("\n\n")
}

export const TASK_TYPE_LABEL_LIST = TASK_TYPES.map((type) => TASK_TYPE_LABELS[type])
export const TASK_PRIORITY_LABEL_LIST = TASK_PRIORITY_LABELS

/** Extrai o primeiro objeto JSON do texto (aceita cercas de código ```json). */
export function extractJsonObject(text: string): string | null {
    const segments = text.includes("```") ? text.split("```") : [text]
    for (const segment of segments) {
        const start = segment.indexOf("{")
        const end = segment.lastIndexOf("}")
        if (start !== -1 && end > start) return segment.slice(start, end + 1)
    }
    return null
}

/** Valida a saída da IA contra o schema da prévia; `null` quando não for JSON válido. */
export function parseDraftPreview(text: string): DraftPreview | null {
    const json = extractJsonObject(text)
    if (!json) return null
    try {
        const parsed = draftPreviewSchema.safeParse(JSON.parse(json))
        return parsed.success ? parsed.data : null
    } catch {
        return null
    }
}
