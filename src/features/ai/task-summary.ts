import { createHash } from "crypto"
import { TASK_PRIORITY_LABELS, TASK_TYPE_LABELS, type TaskPriority, type TaskType } from "@/features/tasks/constants"
import type { TaskDetailDto } from "@/features/tasks/types"
import type { TaskSummarySettings } from "./schemas"

/**
 * Entrada da feature "Resumos de tarefas" (módulo puro): hash da fonte (título + descrição),
 * detecção de resumo desatualizado, instruções (prompt de sistema) e a tarefa em Markdown.
 */

const MAX_DESCRIPTION = 6000

/** Campos que definem o conteúdo do resumo. */
export interface TaskSummarySource {
    title: string
    description: string | null
}

/** Tarefa como o agente a recebe. */
export interface TaskSummaryInput {
    code: string
    title: string
    description: string | null
    taskType: TaskType | null
    priority: TaskPriority
    projectName: string | null
}

/** Fonte considerada no resumo: título + descrição normalizados. */
export function taskSummarySource(task: TaskSummarySource): string {
    return `${task.title.trim()}\n${(task.description ?? "").trim()}`
}

/** Hash estável da fonte: comparado para saber se o resumo ficou desatualizado. */
export function taskSummarySourceHash(task: TaskSummarySource): string {
    return createHash("sha1").update(taskSummarySource(task)).digest("hex")
}

/** Sem resumo, ou resumo de uma fonte que já mudou (precisa regenerar). */
export function needsSummary(task: TaskSummarySource & { summary: string | null; summarySourceHash: string | null }): boolean {
    if (!task.summary?.trim()) return true
    return task.summarySourceHash !== taskSummarySourceHash(task)
}

export function buildTaskSummaryInstructions(settings: Pick<TaskSummarySettings, "instructions" | "maxLength">): string {
    return `${settings.instructions.trim()}\n\nResponda com UMA única linha, no máximo ${settings.maxLength} caracteres.`
}

function clip(text: string | null | undefined, max: number): string {
    const value = (text ?? "").trim()
    return value.length > max ? `${value.slice(0, max)}… (cortado)` : value
}

export function buildTaskSummaryPrompt(task: TaskSummaryInput): string {
    const facts = [
        `- Código: ${task.code}`,
        `- Tipo: ${task.taskType ? TASK_TYPE_LABELS[task.taskType] : "não informado"}`,
        `- Prioridade: ${TASK_PRIORITY_LABELS[task.priority]}`,
        task.projectName && `- Projeto: ${task.projectName}`,
    ].filter(Boolean)
    return [`# Tarefa ${task.code}: ${task.title}`, facts.join("\n"), task.description ? `## Descrição\n${clip(task.description, MAX_DESCRIPTION)}` : ""].filter(Boolean).join("\n\n")
}

export function taskSummaryInputFromDetail(task: TaskDetailDto): TaskSummaryInput {
    return {
        code: task.code,
        title: task.title,
        description: task.description,
        taskType: task.taskType,
        priority: task.priority,
        projectName: task.project?.name ?? null,
    }
}

function cleanLine(line: string): string {
    return line
        .replace(/^#+\s*/, "")
        .replace(/^[-*•]\s*/, "")
        .replace(/[*_`]/g, "")
        .trim()
}

/**
 * Normaliza a saída do modelo para um resumo de 1 linha: descarta cercas de código, pega a
 * primeira linha com conteúdo, colapsa espaços e corta no tamanho máximo — em limite de palavra
 * quando possível, para não terminar no meio de uma (ex.: "integraç…").
 */
export function toSummaryLine(text: string, maxLength: number): string {
    const line =
        text
            .split(/\r?\n/)
            .filter((candidate) => !/^\s*```/.test(candidate))
            .map(cleanLine)
            .find((candidate) => candidate.length > 0) ?? ""
    const collapsed = line.replace(/\s+/g, " ").trim()
    return truncateAtWord(collapsed, maxLength)
}

function truncateAtWord(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    const slice = text.slice(0, maxLength)
    const lastSpace = slice.lastIndexOf(" ")
    if (lastSpace <= 0) return slice
    return `${slice.slice(0, lastSpace).trimEnd()}…`
}
