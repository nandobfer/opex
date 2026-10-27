import { TASK_PRIORITY_LABELS, TASK_TYPE_LABELS } from "@/features/tasks/constants"
import type { TaskDetailDto } from "@/features/tasks/types"
import { FINDING_SEVERITY_LABELS, type FindingSeverity } from "./constants"
import type { AdversarialContext } from "./schemas"

/**
 * Contexto do Agente Adversário (módulo PURO): monta, a partir das chaves da configuração, as
 * seções em Markdown que acompanham o código. Nada entra sem a chave ligada — o adversário começa
 * sem viés, numa sessão nova, e só vê o que o usuário escolheu.
 */

export interface PlanVersion {
    version: number
    text: string
    feedback: string | null
}

export interface PreviousRound {
    round: number
    findings: { id: string; severity: FindingSeverity; title: string; file: string | null; line: number | null; scenario: string; suggestion: string }[]
    disputes: { id: string; reason: string }[]
    /** Pedido do usuário ao mandar corrigir (quando houve). */
    userText: string | null
}

export interface ContextSources {
    task: TaskDetailDto | null
    plans: readonly PlanVersion[]
    centralInstructions: string
    previous: PreviousRound | null
    /** Anexos confirmados da tarefa (a `TaskDetailDto` só traz o contador). */
    attachments?: readonly { name: string }[]
    /** Rótulos das tags da tarefa (a `TaskDetailDto` traz os ids da taxonomia). */
    tagLabels?: readonly string[]
    /** Nomes dos anexos enviados como arquivo (o conteúdo vai anexado ao prompt). */
    attachedFiles?: readonly string[]
}

export interface ContextSection {
    title: string
    body: string
}

function when(iso: string | null): string {
    if (!iso) return "data desconhecida"
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
}

const lines = (items: readonly (string | false | null | undefined)[]) => items.filter(Boolean).join("\n")

function taskSections(task: TaskDetailDto, include: AdversarialContext["task"], sources: ContextSources): ContextSection[] {
    const sections: ContextSection[] = []
    const add = (title: string, body: string | null | undefined) => {
        const value = (body ?? "").trim()
        if (value) sections.push({ title, body: value })
    }
    if (include.basics)
        add(
            "Dados da tarefa",
            lines([
                `- Código: ${task.code}`,
                `- Título: ${task.title}`,
                `- Tipo: ${task.taskType ? TASK_TYPE_LABELS[task.taskType] : "não informado"}`,
                `- Prioridade: ${TASK_PRIORITY_LABELS[task.priority]}`,
                task.project && `- Projeto: ${task.project.name}`,
            ]),
        )
    if (include.description) add("Descrição", task.description)
    if (include.technicalSpec) add("Especificação técnica", task.technicalSpec)
    const tags = sources.tagLabels ?? task.tags
    if (include.insights) add("Resumo e tags (Opex)", lines([task.summary && `- Resumo: ${task.summary}`, tags.length ? `- Tags: ${tags.join(", ")}` : null]))
    if (include.comments) add("Comentários", task.comments.map((comment) => `### ${comment.authorName || "Autor desconhecido"} — ${when(comment.createdAt)}\n${comment.content.trim()}`).join("\n\n"))
    if (include.history) add("Histórico", task.history.map((entry) => `- ${when(entry.createdAt)} — ${entry.description || entry.action}`).join("\n"))
    if (include.timeLogs) add("Apontamentos de horas", task.timeLogs.map((log) => `- ${when(log.startTime)}${log.duration ? ` (${log.duration} min)` : ""}${log.description ? `: ${log.description}` : ""}`).join("\n"))
    const attachments = sources.attachments ?? []
    if (include.attachments !== "none" && attachments.length) {
        const attached = new Set(sources.attachedFiles ?? [])
        const note = include.attachments === "files" ? "Os marcados com 📎 estão anexados a esta mensagem; os demais excederam o limite de tamanho." : "Somente os nomes; o conteúdo não foi enviado."
        add("Anexos", `${note}\n${attachments.map((file) => `- ${attached.has(file.name) ? "📎 " : ""}${file.name}`).join("\n")}`)
    }
    return sections
}

function workbenchSections(sources: ContextSources, include: AdversarialContext["workbench"]): ContextSection[] {
    const sections: ContextSection[] = []
    const current = sources.plans.at(-1)
    if (include.approvedPlan && current) sections.push({ title: `Plano aprovado (versão ${current.version})`, body: current.text.trim() })
    if (include.planHistory && sources.plans.length > 1)
        sections.push({
            title: "Versões anteriores do plano",
            body: sources.plans
                .slice(0, -1)
                .map((plan) => `### Versão ${plan.version}${plan.feedback ? `\nPedido que a originou: ${plan.feedback.trim()}` : ""}\n${plan.text.trim()}`)
                .join("\n\n"),
        })
    if (include.cycleFeedback && current?.feedback?.trim()) sections.push({ title: "Pedido de correção deste ciclo (prévia, PR ou usuário)", body: current.feedback.trim() })
    if (include.centralInstructions && sources.centralInstructions.trim()) sections.push({ title: "Instruções da central para a implementação", body: sources.centralInstructions.trim() })
    return sections
}

function previousSection(previous: PreviousRound): ContextSection {
    const findings = previous.findings.map((finding) => `- **${finding.id}** (${FINDING_SEVERITY_LABELS[finding.severity]}) ${finding.title}${finding.file ? ` — \`${finding.file}${finding.line ? `:${finding.line}` : ""}\`` : ""}\n  Cenário: ${finding.scenario}`)
    const disputes = previous.disputes.map((dispute) => `- **${dispute.id}**: ${dispute.reason}`)
    return {
        title: `Rodada anterior (${previous.round}): achados bloqueantes`,
        body: lines([
            findings.join("\n"),
            disputes.length > 0 && `\n### Contestações do implementador\n${disputes.join("\n")}`,
            previous.userText?.trim() && `\n### Orientação do usuário ao implementador\n${previous.userText.trim()}`,
        ]),
    }
}

/** Seções do contexto, na ordem: tarefa, mesa, rodada anterior. */
export function buildContextSections(context: AdversarialContext, sources: ContextSources): ContextSection[] {
    return [
        ...(sources.task ? taskSections(sources.task, context.task, sources) : []),
        ...workbenchSections(sources, context.workbench),
        ...(context.rounds.previousFindings && sources.previous && sources.previous.findings.length > 0 ? [previousSection(sources.previous)] : []),
    ]
}

/** Seções que a configuração envia (quando houver conteúdo), na ordem do prompt — prévia da aba Contexto. */
export function plannedSectionTitles(context: AdversarialContext): string[] {
    const task = context.task
    const bench = context.workbench
    return [
        task.basics && "Dados da tarefa",
        task.description && "Descrição",
        task.technicalSpec && "Especificação técnica",
        task.insights && "Resumo e tags (Opex)",
        task.comments && "Comentários",
        task.history && "Histórico",
        task.timeLogs && "Apontamentos de horas",
        task.attachments === "names" && "Anexos (só os nomes)",
        task.attachments === "files" && "Anexos (nomes e arquivos)",
        bench.approvedPlan && "Plano aprovado",
        bench.planHistory && "Versões anteriores do plano",
        bench.cycleFeedback && "Pedido de correção deste ciclo",
        bench.centralInstructions && "Instruções da central para a implementação",
        context.rounds.previousFindings && "Rodada anterior: achados bloqueantes e contestações",
    ].filter((title): title is string => Boolean(title))
}

export function renderContext(sections: readonly ContextSection[]): string {
    return sections.map((section) => `## ${section.title}\n${section.body}`).join("\n\n")
}
