import { TASK_PRIORITY_LABELS, TASK_TYPE_LABELS, TASK_TYPES, type TaskType } from "@/features/tasks/constants"
import type { JevQuestion } from "@/lib/ai/jev"
import { draftEstimateSchema, draftPreviewSchema, type DraftPreview } from "./schemas"

/**
 * Montagem dos prompts do orçamento da tarefa (módulo PURO), em DUAS fases:
 * 1. **Prévia**: a IA lê a descrição do cliente e devolve `title`, `taskType`, `priority`,
 *    `summary` e `technicalSpec`.
 * 2. **Estimativa**: a IA recebe a prévia, o pedido e as tarefas semelhantes (com o **tempo de
 *    execução observado**) e devolve `{ estimatedHours }` numa única chamada — sem agente; o JEV
 *    entra como um `score` fracionário interpolado para horas.
 */

export interface BudgetPreviewInput {
    projectName: string
    description: string
    /** Texto de correção pedido pelo cliente (some quando não houver). */
    correction: string | null
    /** Prévia atual, quando há correção: a IA deve ajustar só o que foi pedido. */
    previousPreview?: DraftPreview | null
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
        '- "summary": string, um resumo de UMA linha (sem Markdown);',
        '- "clarity": objeto com a avaliação de clareza da descrição do cliente, com exatamente estas chaves:',
        '  - "acceptanceCriteria": { "status": "clear" | "vague" | "missing", "detail": string curta ou null } — quão explícitos estão os critérios de aceite (o que define a tarefa como concluída);',
        '  - "location": { "status": "clear" | "vague" | "missing", "detail": string curta ou null } — quão explícita está a localização (página/tela, rota e parte da interface).',
        'Use "clear" quando a descrição disser explicitamente, "vague" quando estiver implícito ou incompleto e "missing" quando a descrição não mencionar.',
        'Na "technicalSpec", inclua sempre as seções "## Critérios de aceite" (o que define a tarefa como concluída) e "## Localização" (página/tela, rota e parte da interface), com o que a descrição permitir; não invente o que não estiver nela.',
    ].join("\n")
    return `${instructions.trim()}\n\n${contract}`
}

/** Prévia atual, quando há correção: a IA deve ajustar só o que foi pedido, sem refazer tudo. */
function previousPreviewSection(preview: DraftPreview | null | undefined): string {
    if (!preview) return ""
    const lines = [
        "## Prévia atual (mantenha o que não for pedido para mudar)",
        `Título: ${preview.title}`,
        `Tipo: ${preview.taskType ? TASK_TYPE_LABELS[preview.taskType] : "não classificado"}`,
        `Prioridade: ${TASK_PRIORITY_LABELS[preview.priority]}`,
        preview.summary ? `Resumo: ${preview.summary}` : "",
        preview.technicalSpec ? `Especificação técnica:\n${clip(preview.technicalSpec, 12_000)}` : "",
    ]
    return lines.filter(Boolean).join("\n")
}

/** Prompt com a tarefa do cliente (fase 1 — prévia). */
export function buildBudgetPreviewPrompt(input: BudgetPreviewInput): string {
    const correcting = Boolean(input.correction && input.previousPreview)
    const parts = [
        "# Novo pedido do cliente",
        `Repositório: ${input.projectName}`,
        "## Descrição do cliente",
        clip(input.description),
        input.correction ? `## Correção solicitada\n${clip(input.correction, 4000)}` : "",
        previousPreviewSection(correcting ? input.previousPreview : null),
        correcting
            ? "Aplique SOMENTE o ajuste pedido sobre a prévia atual: mantenha inalterados título, tipo, prioridade, resumo, especificação e clareza no que não foi solicitado. Só substitua tudo se a correção pedir explicitamente para refazer ou reconsiderar a prévia inteira."
            : "Interprete a descrição e gere a prévia da tarefa (título, tipo, prioridade, resumo e especificação técnica).",
    ]
    return parts.filter(Boolean).join("\n\n")
}

/** Instruções de sistema da estimativa (fase 2 — uma chamada, ancorada no histórico). */
export function buildBudgetEstimateInstructions(instructions: string): string {
    const contract = [
        "Você estima o TEMPO DE EXECUÇÃO de uma tarefa, em horas, para fins de orçamento.",
        "Ancore a estimativa nas horas reais apontadas nas tarefas semelhantes: o valor deve ficar próximo da MEDIANA do histórico apresentado.",
        "Só se afaste da mediana quando a tarefa for claramente maior ou menor que as semelhantes. Não estime pelo tamanho do texto da especificação.",
        "Responda APENAS com um objeto JSON válido, sem texto antes ou depois e sem cercas de código, com exatamente esta chave:",
        '- "estimatedHours": número de horas (aceita fração, ex.: 0.5).',
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

/** Mediana e faixa das horas reais das tarefas semelhantes (âncora da estimativa). */
export interface EstimateAnchor {
    count: number
    median: number
    min: number
    max: number
}

/** Calcula a mediana/mín/máx das horas reais das tarefas semelhantes; `null` sem horas. */
export function estimateAnchor(similar: readonly EstimateContextTask[]): EstimateAnchor | null {
    const hours = similar
        .map((task) => task.hours)
        .filter((value): value is number => value != null)
        .sort((a, b) => a - b)
    if (hours.length === 0) return null
    const mid = Math.floor(hours.length / 2)
    const median = hours.length % 2 === 1 ? hours[mid]! : Math.round(((hours[mid - 1]! + hours[mid]!) / 2) * 100) / 100
    return { count: hours.length, median, min: hours[0]!, max: hours[hours.length - 1]! }
}

function anchorSection(anchor: EstimateAnchor | null): string {
    if (!anchor) return ""
    return [
        "## Referência do histórico (tempo de execução observado)",
        `${anchor.count} tarefa(s) semelhante(s) com horas reais apontadas: mediana ${anchor.median} h (mínimo ${anchor.min} h, máximo ${anchor.max} h).`,
        "A estimativa deve ficar próxima da mediana, salvo se esta tarefa for claramente maior ou menor.",
    ].join("\n")
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
        anchorSection(estimateAnchor(similar)),
        similarSection(similar),
        "Estime o tempo de execução desta tarefa usando o histórico acima como referência principal.",
    ]
    return parts.filter(Boolean).join("\n\n")
}

// ── Estimativa via JEV (decisão estruturada: um `score` fracionário interpolado) ──

export const JEV_ESTIMATE_QUESTION_ID = "estimated_hours"

/**
 * Níveis de **tempo de execução**, do menor ao maior (10 níveis = máximo do JEV). Descrevem
 * situações em minutos/horas para o modelo posicionar o tempo observado.
 */
export const JEV_ESTIMATE_LEVELS = [
    "Até 5 minutos",
    "5 a 10 minutos",
    "10 a 20 minutos",
    "20 a 30 minutos",
    "30 a 45 minutos",
    "45 minutos a 1 hora",
    "1 a 2 horas",
    "2 a 4 horas",
    "4 a 8 horas",
    "Mais de 8 horas",
] as const

/** Horas representativas de cada nível (âncoras para a interpolação do `score` fracionário). */
export const JEV_ESTIMATE_HOURS = [0.05, 0.12, 0.25, 0.42, 0.62, 0.75, 1.5, 3, 6, 12] as const

/** Pergunta `score` única: a posição da tarefa na escala de tempo de execução observado. */
export function buildJevEstimateQuestions(): Record<string, JevQuestion> {
    return {
        [JEV_ESTIMATE_QUESTION_ID]: {
            type: "score",
            instructions: "Em qual posição da escala de TEMPO DE EXECUÇÃO observado esta tarefa se encaixa, considerando as tarefas semelhantes e a mediana apresentada?",
            criteria: [...JEV_ESTIMATE_LEVELS],
        },
    }
}

/**
 * Mapeia o `score` do JEV (posição fracionária de 0 a N-1) para horas por **interpolação linear**
 * entre as âncoras dos níveis — sem arredondar para o teto da faixa (o `score` é a média ponderada
 * das probabilidades e pode cair entre dois níveis).
 */
export function mapJevEstimateScore(score: number): number {
    const top = JEV_ESTIMATE_HOURS.length - 1
    const clamped = Math.max(0, Math.min(top, score))
    const low = Math.floor(clamped)
    const high = Math.min(top, low + 1)
    const t = clamped - low
    const hours = JEV_ESTIMATE_HOURS[low]! + (JEV_ESTIMATE_HOURS[high]! - JEV_ESTIMATE_HOURS[low]!) * t
    return Math.round(hours * 100) / 100
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
