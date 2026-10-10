import { TASK_PRIORITY_LABELS, TASK_TYPE_LABELS, TASK_TYPES, type TaskType } from "@/features/tasks/constants"
import type { JevQuestion } from "@/lib/ai/jev"
import { draftEstimateSchema, draftPreviewSchema, type DraftPreview } from "./schemas"

/**
 * Montagem dos prompts do orçamento da tarefa (módulo PURO), em DUAS fases:
 * 1. **Prévia**: a IA lê a descrição do cliente e devolve `title`, `taskType`, `priority`,
 *    `summary` e `technicalSpec`.
 * 2. **Estimativa**: um agente do OpenCode recebe a prévia + o pedido e devolve `estimatedHours`.
 *    O agente roda tools no servidor (consulta ao banco via MCP) e pensa antes de responder — o
 *    histórico de horas não é injetado no prompt.
 */

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

/** Instruções de sistema da prévia (instruções configuradas + contrato de saída JSON). */
export function buildBudgetPreviewInstructions(instructions: string): string {
    const contract = [
        "Responda APENAS com um objeto JSON válido, sem texto antes ou depois e sem cercas de código, com exatamente estas chaves:",
        "- \"title\": string, um título curto e específico da tarefa;",
        `- "taskType": um de ${TASK_TYPES.map((type) => `"${type}"`).join(", ")} ou null quando não for possível classificar;`,
        '- "priority": "urgent", "high", "medium" ou "low";',
        '- "technicalSpec": string em Markdown, a especificação técnica do que deve ser feito;',
        '- "summary": string, um resumo de UMA linha (sem Markdown).',
    ].join("\n")
    return `${instructions.trim()}\n\n${contract}`
}

/** Prompt com a tarefa do cliente (fase 1 — prévia). */
export function buildBudgetPreviewPrompt(input: BudgetPreviewInput): string {
    const parts = [
        "# Novo pedido do cliente",
        `Repositório: ${input.projectName}`,
        "## Descrição do cliente",
        clip(input.description),
        input.correction ? `## Correção solicitada\n${clip(input.correction, 4000)}` : "",
        "Interprete a descrição e gere a prévia da tarefa (título, tipo, prioridade, resumo e especificação técnica).",
    ]
    return parts.filter(Boolean).join("\n\n")
}

/** Instruções de sistema da estimativa (fase 2 — uma chamada, com o histórico já no prompt). */
export function buildBudgetEstimateInstructions(instructions: string): string {
    const contract = [
        "Você estima o esforço de implementação de uma tarefa, em horas de desenvolvimento, com base no pedido e no histórico de tarefas semelhantes apresentado no prompt.",
        "Considere a complexidade, o tipo e as horas reais apontadas nas tarefas semelhantes. Seja conservador quando houver incerteza.",
        "Responda APENAS com um objeto JSON válido, sem texto antes ou depois e sem cercas de código, com exatamente esta chave:",
        '- "estimatedHours": número de horas (aceita fração, ex.: 2.5).',
    ].join("\n")
    return `${instructions.trim()}\n\n${contract}`
}

/** Tarefa do histórico apresentada ao estimador (horas reais apontadas ou estimativa anterior). */
export interface EstimateContextTask {
    code: string
    title: string
    taskType: TaskType | null
    tags: string[]
    hours: number | null
}

function similarSection(similar: readonly EstimateContextTask[]): string {
    if (similar.length === 0) return "## Tarefas semelhantes\nNenhuma tarefa semelhante encontrada no histórico."
    const lines = similar.map((task) => {
        const meta = [
            `tipo: ${task.taskType ? TASK_TYPE_LABELS[task.taskType] : "não informado"}`,
            task.tags.length ? `tags: ${task.tags.join(", ")}` : "",
            task.hours != null ? `horas: ${task.hours} h` : "sem horas registradas",
        ].filter(Boolean)
        return `- ${task.code} — ${task.title} (${meta.join("; ")})`
    })
    return `## Tarefas semelhantes (histórico)\n${lines.join("\n")}`
}

/** Prompt da estimativa: a prévia, o pedido e o histórico de tarefas semelhantes (pré-buscado). */
export function buildBudgetEstimatePrompt(preview: DraftPreview, input: BudgetPreviewInput, similar: readonly EstimateContextTask[] = []): string {
    const parts = [
        "# Tarefa a estimar",
        `Repositório: ${input.projectName}`,
        `Título: ${preview.title}`,
        `Tipo: ${preview.taskType ? TASK_TYPE_LABELS[preview.taskType] : "não classificado"}`,
        `Prioridade: ${TASK_PRIORITY_LABELS[preview.priority]}`,
        preview.summary ? `Resumo: ${preview.summary}` : "",
        preview.technicalSpec ? `## Especificação técnica\n${clip(preview.technicalSpec, 12_000)}` : "",
        "## Pedido original do cliente",
        clip(input.description),
        input.correction ? `## Correção solicitada\n${clip(input.correction, 4000)}` : "",
        similarSection(similar),
        "Estime as horas de implementação desta tarefa usando o histórico acima como referência.",
    ]
    return parts.filter(Boolean).join("\n\n")
}

// ── Estimativa via JEV (decisão estruturada: um `score` mapeado para horas) ──

export const JEV_ESTIMATE_QUESTION_ID = "estimated_hours"

/** Níveis de esforço (índice = nível; o JEV devolve a posição, que mapeia para horas). */
export const JEV_ESTIMATE_LEVELS = [
    "Até 2 horas (ajuste trivial, poucos arquivos)",
    "3 a 4 horas (tarefa pequena, escopo claro)",
    "5 a 8 horas (tarefa média, vários arquivos e testes)",
    "9 a 16 horas (tarefa grande, integração ou refatoração)",
    "17 a 32 horas (tarefa muito grande, várias partes)",
    "Mais de 32 horas (épico, alto risco ou incerteza)",
] as const

/** Horas representativas de cada nível (política explícita de mapeamento `score` → horas). */
export const JEV_ESTIMATE_HOURS = [2, 4, 8, 16, 32, 48] as const

/** Pergunta `score` única: quanto esforço a tarefa exige, considerando o histórico. */
export function buildJevEstimateQuestions(): Record<string, JevQuestion> {
    return {
        [JEV_ESTIMATE_QUESTION_ID]: {
            type: "score",
            instructions: "Quanto esforço de implementação (em horas de desenvolvimento) esta tarefa exige, considerando as tarefas semelhantes apresentadas?",
            criteria: [...JEV_ESTIMATE_LEVELS],
        },
    }
}

/** Mapeia o `score` do JEV (0..N, pode ser fracionário) para horas, arredondando ao nível mais próximo. */
export function mapJevEstimateScore(score: number): number {
    const index = Math.max(0, Math.min(JEV_ESTIMATE_HOURS.length - 1, Math.round(score)))
    return JEV_ESTIMATE_HOURS[index]!
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

/** Valida a saída da IA contra o schema da estimativa; `null` quando não for JSON válido. */
export function parseEstimateHours(text: string): number | null {
    const json = extractJsonObject(text)
    if (!json) return null
    try {
        const parsed = draftEstimateSchema.safeParse(JSON.parse(json))
        return parsed.success ? parsed.data.estimatedHours : null
    } catch {
        return null
    }
}
