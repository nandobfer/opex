import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, TASK_TYPE_LABELS } from "@/features/tasks/constants"
import type { TaskDetailDto } from "@/features/tasks/types"
import type { TaskDraftDetailDto } from "@/features/github/types"
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

/** Dados do rascunho usados na entrada (o corpo com URLs assinadas, `previewBody`, nunca entra). */
export type UnderstandDraftInput = Pick<
    TaskDraftDetailDto,
    | "code"
    | "title"
    | "body"
    | "issueTitle"
    | "issueBody"
    | "repo"
    | "number"
    | "issueState"
    | "author"
    | "labels"
    | "issueType"
    | "milestone"
    | "assignees"
    | "product"
    | "taskType"
    | "priority"
    | "assignee"
    | "workPackage"
    | "columnName"
    | "imageCount"
    | "comments"
    | "issueCreatedAt"
>

/**
 * Entrada de um rascunho (issue do GitHub ainda não enviada ao Go! Sipal). Dos itens opcionais só
 * "Comentários" se aplica (comentários da issue); histórico, apontamentos e plano não existem.
 */
export function buildUnderstandDraftPrompt(draft: UnderstandDraftInput, include: Pick<UnderstandTaskSettings["include"], "comments">): string {
    const author = draft.author.name ? `${draft.author.name} (@${draft.author.login})` : `@${draft.author.login}`
    const facts = [
        `- Origem: issue ${draft.repo}#${draft.number} (${draft.issueState === "open" ? "aberta" : "fechada"})`,
        `- Autor da issue: ${author}${draft.issueCreatedAt ? ` em ${when(draft.issueCreatedAt)}` : ""}`,
        draft.labels.length > 0 && `- Labels: ${draft.labels.join(", ")}`,
        draft.issueType && `- Issue Type: ${draft.issueType}`,
        draft.milestone && `- Milestone: ${draft.milestone}`,
        draft.assignees.length > 0 && `- Assignees no GitHub: ${draft.assignees.map((login) => `@${login}`).join(", ")}`,
        `- Tipo: ${TASK_TYPE_LABELS[draft.taskType]}`,
        `- Prioridade: ${TASK_PRIORITY_LABELS[draft.priority]}`,
        `- Produto: ${draft.product.name}`,
        draft.workPackage && `- Pacote de trabalho: ${draft.workPackage.name}`,
        draft.assignee && `- Responsável: ${draft.assignee.name}`,
        draft.columnName && `- Coluna: ${draft.columnName}`,
    ].filter(Boolean)

    const edited = draft.title.trim() !== draft.issueTitle.trim() || draft.body.trim() !== draft.issueBody.trim()
    const original = edited ? [`Título: ${draft.issueTitle}`, clip(draft.issueBody)].filter(Boolean).join("\n\n") : ""

    const parts = [
        `# Rascunho ${draft.code}: ${draft.title}`,
        "Issue do GitHub ainda não enviada ao Go! Sipal (vai virar uma tarefa do Centro de Desenvolvimento).",
        section("Dados", facts.join("\n")),
        section("Descrição", clip(draft.body)),
        section("Texto original da issue (antes das edições do rascunho)", original),
        draft.imageCount > 0 ? `${draft.imageCount} imagem(ns) no corpo da issue não foram enviadas.` : "",
        include.comments
            ? section("Comentários da issue", draft.comments.map((comment) => `### ${comment.author ? `@${comment.author.login}` : "Autor desconhecido"} — ${when(comment.createdAt)}\n${clip(comment.body, 3000)}`).join("\n\n"))
            : "",
    ]
    return parts.filter(Boolean).join("\n\n")
}

export function buildUnderstandTaskPrompt(task: TaskDetailDto, include: UnderstandTaskSettings["include"]): string {
    const facts = [
        `- Código: ${task.code}`,
        `- Tipo: ${task.taskType ? TASK_TYPE_LABELS[task.taskType] : "não informado"}`,
        `- Prioridade: ${TASK_PRIORITY_LABELS[task.priority]}`,
        `- Status: ${TASK_STATUS_LABELS[task.status]}`,
        task.product && `- Produto: ${task.product.name}`,
        task.workPackage && `- Pacote de trabalho: ${task.workPackage.name}`,
        task.assignee && `- Responsável: ${task.assignee.name}`,
        task.createdBy && `- Criada por: ${task.createdBy.name}${task.createdAt ? ` em ${when(task.createdAt)}` : ""}`,
        task.linkedRequest && `- Solicitação vinculada: ${task.linkedRequest.code}${task.linkedRequest.title ? ` — ${task.linkedRequest.title}` : ""}`,
        task.linkedImprovement && `- Melhoria vinculada: ${task.linkedImprovement.code}${task.linkedImprovement.title ? ` — ${task.linkedImprovement.title}` : ""}`,
        task.issue && `- Issue do GitHub: ${task.issue.repo}#${task.issue.number} (${task.issue.state === "open" ? "aberta" : "fechada"})`,
        task.totalTimeLogged > 0 && `- Horas apontadas: ${(task.totalTimeLogged / 60).toFixed(1)} h`,
    ].filter(Boolean)

    const plan = task.implementationPlan
    const parts = [
        `# Tarefa ${task.code}: ${task.title}`,
        section("Dados", facts.join("\n")),
        section("Descrição", clip(task.description)),
        section("Especificação técnica", clip(task.technicalSpec)),
        section("Contexto de negócio", clip(task.businessContext)),
        section("Critérios de aceite", task.acceptanceCriteria.map((item) => `- ${item}`).join("\n")),
        include.plan && plan
            ? section(
                  "Plano de implementação",
                  [
                      plan.complexity && `Complexidade: ${plan.complexity}`,
                      plan.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"),
                      plan.relatedFiles.length ? `Arquivos relacionados: ${plan.relatedFiles.join(", ")}` : "",
                  ]
                      .filter(Boolean)
                      .join("\n"),
              )
            : "",
        include.comments ? section("Comentários", task.comments.map((comment) => `### ${comment.author?.name ?? "Autor desconhecido"} — ${when(comment.createdAt)}\n${clip(comment.content, 3000)}`).join("\n\n")) : "",
        include.history ? section("Histórico", task.history.map((entry) => `- ${when(entry.createdAt)} — ${entry.performedBy?.name ?? "sistema"}: ${entry.description || entry.action}`).join("\n")) : "",
        include.timeLogs
            ? section(
                  "Apontamentos de horas",
                  task.timeLogs.map((log) => `- ${when(log.startTime)} — ${log.user?.name ?? "?"}${log.duration ? ` (${log.duration} min)` : ""}${log.description ? `: ${log.description}` : ""}`).join("\n"),
              )
            : "",
        section("Anexos (somente os nomes; o conteúdo não foi enviado)", task.attachments.map((file) => `- ${file.name}`).join("\n")),
    ]
    return parts.filter(Boolean).join("\n\n")
}
