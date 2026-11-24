import { formatAttachmentSize } from "@/lib/attachments"
import { workbenchStageLabel, type WorkbenchStage } from "./constants"

/**
 * Contexto da mesa para o agente (OPE-178, módulo puro). O agente da mesa (qualquer etapa, fork ou
 * sessão recriada) não depende do histórico da conversa do OpenCode para saber a tarefa, o plano e os
 * anexos: todo turno leva um cabeçalho curto e o MCP somente leitura "Mesa do Opex" (`opex_mesa`)
 * entrega os dados quando o agente precisa. Sem o MCP, o pacote completo vai no próprio prompt.
 */

export const WORKBENCH_MCP_SERVER = "opex_mesa"
/** Prefixo dos nomes das ferramentas vistas pelo modelo no OpenCode. */
export const WORKBENCH_MCP_TOOL_PREFIX = `${WORKBENCH_MCP_SERVER}_`
export const WORKBENCH_MCP_PATH = "/api/agentic/mcp"

export const WORKBENCH_MCP_TOOLS = ["get_workbench", "get_task", "get_plan", "list_plan_versions", "list_forks", "list_attachments", "get_attachment"] as const
export type WorkbenchMcpToolName = (typeof WORKBENCH_MCP_TOOLS)[number]

/** Quando usar cada ferramenta (texto do cabeçalho e descrição no `tools/list`). */
export const WORKBENCH_MCP_TOOL_USAGE: Record<WorkbenchMcpToolName, string> = {
    get_workbench: "visão geral da mesa: etapa, branch, worktree, PR, prévia, versões do plano, forks e anexos",
    get_task: "descrição, especificação técnica e comentários da tarefa",
    get_plan: "texto completo do plano (padrão: a versão que rege a etapa; aceita `approved`, `latest` ou o número)",
    list_plan_versions: "versões do plano com o pedido (feedback) que originou cada uma",
    list_forks: "conversas paralelas (forks) e os resumos integrados à mesa",
    list_attachments: "arquivos enviados na mesa e nos forks e os anexos da página da tarefa",
    get_attachment: "um anexo pelo id: conteúdo direto (texto/imagem) e um link novo para baixar",
}

export const workbenchMcpToolName = (name: WorkbenchMcpToolName) => `${WORKBENCH_MCP_TOOL_PREFIX}${name}`

export interface WorkbenchPlanLike {
    version: number
    text: string
    feedback?: string | null
    createdAt?: Date | string | null
}

/** Etapas em que vale a versão mais recente do plano (ele está sendo escrito ou revisado). */
const LATEST_PLAN_STAGES: ReadonlySet<WorkbenchStage> = new Set(["refining", "spec_ready", "planning", "plan_review"])

export interface GoverningPlan {
    plan: WorkbenchPlanLike
    /** É a versão aprovada no último "Implementar". */
    approved: boolean
    latestVersion: number
}

const byVersion = (plans: readonly WorkbenchPlanLike[]) => [...plans].sort((a, b) => a.version - b.version)

/** Versão aprovada (ou `null` quando não há aprovação gravada ou a versão não existe mais). */
export function approvedPlan(plans: readonly WorkbenchPlanLike[], approvedVersion: number | null | undefined): WorkbenchPlanLike | null {
    if (typeof approvedVersion !== "number") return null
    return plans.find((plan) => plan.version === approvedVersion) ?? null
}

/**
 * Plano que rege a etapa: no planejamento e na revisão do plano, a versão mais recente; nas demais
 * (implementação, build, PR, CI, conflito, forks dessas etapas), a aprovada — ou a mais recente quando
 * ainda não houve aprovação (mesas antigas).
 */
export function governingPlan(plans: readonly WorkbenchPlanLike[] | null | undefined, approvedVersion: number | null | undefined, stage: WorkbenchStage): GoverningPlan | null {
    const sorted = byVersion(plans ?? [])
    const latest = sorted.at(-1)
    if (!latest) return null
    const approved = approvedPlan(sorted, approvedVersion)
    if (!LATEST_PLAN_STAGES.has(stage) && approved) return { plan: approved, approved: true, latestVersion: latest.version }
    return { plan: latest, approved: approved?.version === latest.version, latestVersion: latest.version }
}

export interface WorkbenchContextSource {
    code: string
    title: string
    stage: WorkbenchStage
    kind?: "repo" | "plugin"
    branch?: string | null
    worktreePath?: string | null
    sessionDirectory?: string | null
    plans: readonly WorkbenchPlanLike[]
    approvedPlanVersion?: number | null
    forkNotes?: readonly { number: number; summary: string }[]
    pr?: { number: number; url: string; state?: string } | null
    previewUrl?: string | null
    /** Contagem dos anexos (ausente quando não foi possível contar). */
    attachments?: { workbench: number; task: number } | null
    /** Turno de um fork (o número aparece no cabeçalho). */
    fork?: { number: number } | null
}

export interface WorkbenchHeaderOptions {
    /** O MCP `opex_mesa` está registrado no diretório da sessão. */
    mcp: boolean
    /** A sessão do OpenCode acabou de ser criada (o histórico anterior não existe nela). */
    newSession?: boolean
    /** A etapa depende do plano: a leitura pelo MCP é obrigatória antes de agir. */
    requirePlan?: boolean
}

function planLine(source: WorkbenchContextSource): string {
    const governing = governingPlan(source.plans, source.approvedPlanVersion, source.stage)
    if (!governing) return "- Plano: ainda não há versão escrita."
    const kind = governing.approved ? "aprovada" : "mais recente"
    const latest = governing.latestVersion !== governing.plan.version ? ` (a mais recente é a v${governing.latestVersion})` : ""
    return `- Plano que rege esta etapa: versão ${governing.plan.version} (${kind})${latest}; ${source.plans.length} versão(ões) no histórico.`
}

/** Cabeçalho curto de todo turno: onde está a mesa e como consultar os dados dela. */
export function workbenchContextHeader(source: WorkbenchContextSource, options: WorkbenchHeaderOptions): string {
    const governing = governingPlan(source.plans, source.approvedPlanVersion, source.stage)
    const counts = source.attachments
    const lines = [
        "## Mesa do Opex",
        `- Tarefa ${source.code}: ${source.title}${source.fork ? ` · Fork ${source.fork.number}` : ""}`,
        `- Etapa: ${workbenchStageLabel(source.stage, source.kind ?? "repo")}`,
        source.branch ? `- Branch: ${source.branch}${source.worktreePath ? ` · worktree ${source.worktreePath}` : ""}` : "",
        planLine(source),
        source.forkNotes?.length ? `- Forks integrados à mesa: ${source.forkNotes.map((note) => `Fork ${note.number}`).join(", ")}` : "",
        counts ? `- Anexos: ${counts.workbench} da mesa e ${counts.task} da página da tarefa` : "",
        source.pr ? `- Pull Request #${source.pr.number}: ${source.pr.url}${source.pr.state ? ` (${source.pr.state})` : ""}` : "",
        source.previewUrl ? `- Prévia: ${source.previewUrl}` : "",
    ].filter(Boolean)
    const planTool = workbenchMcpToolName("get_plan")
    if (options.mcp) {
        lines.push(
            "",
            `Os dados da mesa estão sempre disponíveis pelas ferramentas \`${WORKBENCH_MCP_TOOL_PREFIX}*\` (somente leitura), mesmo que esta conversa não tenha o histórico:`,
            ...WORKBENCH_MCP_TOOLS.map((name) => `- \`${workbenchMcpToolName(name)}\`: ${WORKBENCH_MCP_TOOL_USAGE[name]}`),
        )
        if (governing && (options.newSession || options.requirePlan)) {
            lines.push("", `ANTES de agir, leia o plano com \`${planTool}\` (versão ${governing.plan.version}) — o texto dessa versão também vai na seção "Plano da mesa" abaixo — e siga-o. Não reescreva o plano de memória.`)
        } else if (governing) {
            lines.push("", `Se o plano v${governing.plan.version} não estiver no histórico desta conversa, leia-o com \`${planTool}\` antes de agir. Para um anexo de mensagem anterior, use \`${workbenchMcpToolName("list_attachments")}\` e \`${workbenchMcpToolName("get_attachment")}\`.`)
        }
    }
    if (options.newSession) lines.push("", "Esta é uma sessão NOVA do OpenCode: o histórico da conversa anterior da mesa não está nela. Os dados da mesa (tarefa, plano, forks e anexos) continuam disponíveis como descrito acima.")
    return lines.join("\n")
}

/**
 * Texto do plano que rege a etapa, sempre no prompt dos turnos que dependem dele (implementação e
 * sessão nova), mesmo com o MCP conectado: o agente nunca começa sem o plano (OPE-178).
 */
export function workbenchPlanSection(source: WorkbenchContextSource): string {
    const governing = governingPlan(source.plans, source.approvedPlanVersion, source.stage)
    if (!governing) return ""
    return [`## Plano da mesa: versão ${governing.plan.version} (${governing.approved ? "aprovada" : "mais recente"})`, governing.plan.text.trim()].join("\n")
}

export interface FallbackAttachment {
    name: string
    mediaType: string
    size: number
    origin: string
    /** Link assinado gerado agora (`null` = o storage não gerou). */
    url: string | null
    /** Motivo de não haver link. */
    reason?: string | null
}

/**
 * Pacote completo no prompt, usado quando o MCP não pôde ser registrado (degradação): plano que rege a
 * etapa, histórico de versões com os pedidos, resumos dos forks, a tarefa e os anexos com link novo.
 */
export function workbenchContextFallback(source: WorkbenchContextSource, extras: { taskMarkdown?: string | null; attachments?: readonly FallbackAttachment[] | null; downloadDir?: string } = {}): string {
    const governing = governingPlan(source.plans, source.approvedPlanVersion, source.stage)
    const versions = byVersion(source.plans)
    const parts = ["## Dados da mesa (as ferramentas da mesa não estão disponíveis neste turno)"]
    if (extras.taskMarkdown?.trim()) parts.push("", "### Tarefa", extras.taskMarkdown.trim())
    if (governing) parts.push("", `### Plano da mesa: versão ${governing.plan.version} (${governing.approved ? "aprovada" : "mais recente"})`, governing.plan.text.trim())
    if (versions.length > 1 || versions.some((plan) => plan.feedback?.trim())) {
        parts.push("", "### Histórico de versões do plano", ...versions.map((plan) => `- v${plan.version}${plan.feedback?.trim() ? `: pedido — ${plan.feedback.trim().replace(/\s+/g, " ").slice(0, 600)}` : ": versão inicial"}`))
    }
    if (source.forkNotes?.length) parts.push("", "### Forks integrados", ...source.forkNotes.map((note) => `#### Fork ${note.number}\n${note.summary.trim()}`))
    if (extras.attachments?.length) {
        parts.push(
            "",
            "### Anexos da mesa e da tarefa",
            extras.downloadDir ? `Baixe FORA do worktree quando precisar (ex.: \`mkdir -p ${extras.downloadDir} && curl -fsSL -o "${extras.downloadDir}/<nome>" "<link>"\`); nunca faça commit desses arquivos.` : "",
            ...extras.attachments.map((file) => `- \`${file.name}\` (${file.origin}; ${file.mediaType}, ${formatAttachmentSize(file.size)}) — ${file.url ? `link (válido por 24 h): ${file.url}` : `o arquivo existe, mas não foi possível gerar o link${file.reason ? `: ${file.reason}` : ""}`}`),
        )
    }
    return parts.filter((part) => part !== "").join("\n")
}

/**
 * Texto do turno com o contexto da mesa ao FINAL (depois do pedido da etapa, antes dos anexos da
 * mensagem): o pedido continua sendo a primeira coisa que o agente lê.
 */
export function withWorkbenchContext(text: string, context: { header: string; fallback?: string | null } | null): string {
    if (!context?.header) return text
    return [text, "---", context.header, context.fallback ?? ""].filter(Boolean).join("\n\n")
}
