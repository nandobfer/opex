import { TASK_PRIORITY_LABELS, TASK_TYPE_LABELS } from "@/features/tasks/constants"
import type { TaskDetailDto } from "@/features/tasks/types"
import { UNDERSTAND_TASK_SECTIONS } from "./constants"
import type { UnderstandTaskSettings } from "./schemas"

/**
 * Entrada da feature "Entender tarefas" (módulo puro): instruções (prompt de sistema + formato) e
 * a tarefa completa em Markdown, conforme o que a configuração manda enviar.
 */

const MAX_TEXT = 6000

function clip(text: string | null | undefined, max = MAX_TEXT): string {
    const value = (text ?? "").trim()
    return value.length > max ? `${value.slice(0, max)}… (cortado)` : value
}

function when(iso: string | null): string {
    if (!iso) return "data desconhecida"
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
}

export function buildUnderstandTaskInstructions(settings: Pick<UnderstandTaskSettings, "instructions" | "responseFormat">): string {
    const format =
        settings.responseFormat === "sections"
            ? `Responda em Markdown exatamente com estas seções, nesta ordem, cada uma como título de nível 2 (##): ${UNDERSTAND_TASK_SECTIONS.join("; ")}. Em seção sem conteúdo, escreva "Nada relevante".`
            : "Responda em Markdown, organizando o texto como achar melhor."
    return `${settings.instructions.trim()}\n\n${format}`
}

function section(title: string, body: string): string {
    return body ? `## ${title}\n${body}` : ""
}

export function buildUnderstandTaskPrompt(task: TaskDetailDto, include: UnderstandTaskSettings["include"]): string {
    const facts = [
        `- Código: ${task.code}`,
        `- Tipo: ${task.taskType ? TASK_TYPE_LABELS[task.taskType] : "não informado"}`,
        `- Prioridade: ${TASK_PRIORITY_LABELS[task.priority]}`,
        task.project && `- Projeto: ${task.project.name}`,
        `- Criada em: ${when(task.createdAt)}`,
        task.issue && `- Issue do GitHub: ${task.issue.repo}#${task.issue.number} (${task.issue.state === "open" ? "aberta" : "fechada"})`,
        task.totalTimeLogged > 0 && `- Horas apontadas: ${(task.totalTimeLogged / 60).toFixed(1)} h`,
    ].filter(Boolean)

    const parts = [
        `# Tarefa ${task.code}: ${task.title}`,
        section("Dados", facts.join("\n")),
        section("Descrição", clip(task.description)),
        section("Especificação técnica", clip(task.technicalSpec)),
        include.comments ? section("Comentários", task.comments.map((comment) => `### ${when(comment.createdAt)}\n${clip(comment.content, 3000)}`).join("\n\n")) : "",
        include.history ? section("Histórico", task.history.map((entry) => `- ${when(entry.createdAt)} — ${entry.description || entry.action}`).join("\n")) : "",
        include.timeLogs
            ? section("Apontamentos de horas", task.timeLogs.map((log) => `- ${when(log.startTime)}${log.duration ? ` (${log.duration} min)` : ""}${log.description ? `: ${log.description}` : ""}`).join("\n"))
            : "",
    ]
    return parts.filter(Boolean).join("\n\n")
}
