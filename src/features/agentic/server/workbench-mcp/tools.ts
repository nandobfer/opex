import { z } from "zod"
import { formatAttachmentSize } from "@/lib/attachments"
import { AgenticFork } from "@/lib/db/models/Agentic"
import type { McpCallResult, McpToolDescriptor } from "@/features/maddox-agent/mcp-protocol"
import { mcpTextResult } from "@/features/maddox-agent/mcp-protocol"
import { workbenchStageLabel, WORKBENCH_STAGES, type WorkbenchStage } from "../../constants"
import { agenticDownloadDir } from "../../files"
import { approvedPlan, governingPlan, WORKBENCH_MCP_TOOL_USAGE, WORKBENCH_MCP_TOOLS, type WorkbenchMcpToolName, type WorkbenchPlanLike } from "../../workbench-context"
import { attachmentBytes, attachmentLink, listWorkbenchAttachments, workbenchTaskMarkdown } from "./data"
import type { WorkbenchMcpScope } from "./scope"

/**
 * Ferramentas do MCP "Mesa do Opex" (OPE-178): SOMENTE leitura, sem segredos e sem id de mesa na
 * entrada — a mesa é sempre a dona da sessão que chamou (`scope.ts`).
 */

/** Teto do texto de um anexo entregue direto na resposta. */
export const WORKBENCH_MCP_TEXT_MAX_BYTES = 200 * 1024
/** Teto de uma imagem entregue como conteúdo de imagem do MCP. */
export const WORKBENCH_MCP_IMAGE_MAX_BYTES = 5 * 1024 * 1024

const planVersionInput = z.preprocess(
    (value) => (typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value),
    z.union([z.number().int().positive(), z.enum(["approved", "latest"])]).optional(),
)

const INPUTS = {
    get_workbench: z.object({}).passthrough(),
    get_task: z.object({}).passthrough(),
    get_plan: z.object({ version: planVersionInput }).passthrough(),
    list_plan_versions: z.object({}).passthrough(),
    list_forks: z.object({}).passthrough(),
    list_attachments: z.object({}).passthrough(),
    get_attachment: z.object({ id: z.string().trim().min(1, "Informe o id do anexo (veja list_attachments)") }).passthrough(),
} satisfies Record<WorkbenchMcpToolName, z.ZodType>

const SCHEMAS: Record<WorkbenchMcpToolName, Record<string, unknown>> = {
    get_workbench: { type: "object", properties: {} },
    get_task: { type: "object", properties: {} },
    get_plan: { type: "object", properties: { version: { type: ["integer", "string"], description: 'Número da versão, "approved" (a aprovada) ou "latest" (a mais recente). Padrão: a versão que rege a etapa atual.' } } },
    list_plan_versions: { type: "object", properties: {} },
    list_forks: { type: "object", properties: {} },
    list_attachments: { type: "object", properties: {} },
    get_attachment: { type: "object", properties: { id: { type: "string", description: "Id do anexo (de list_attachments)." } }, required: ["id"] },
}

/** Descritores do `tools/list` (todas somente leitura). */
export function workbenchToolDescriptors(): McpToolDescriptor[] {
    return WORKBENCH_MCP_TOOLS.map((name) => ({ name, description: `Mesa do Opex (somente leitura): ${WORKBENCH_MCP_TOOL_USAGE[name]}.`, inputSchema: SCHEMAS[name], annotations: { readOnlyHint: true, destructiveHint: false } }))
}

export const isWorkbenchMcpTool = (name: string): name is WorkbenchMcpToolName => (WORKBENCH_MCP_TOOLS as readonly string[]).includes(name)

const asStage = (value: string): WorkbenchStage => ((WORKBENCH_STAGES as readonly string[]).includes(value) ? (value as WorkbenchStage) : "planning")
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : typeof value === "string" ? value : null)
const plansOf = (scope: WorkbenchMcpScope): WorkbenchPlanLike[] => [...(scope.workbench.plans ?? [])].sort((a, b) => a.version - b.version)
const firstLine = (text: string) => text.trim().split("\n").find((line) => line.trim())?.replace(/^#+\s*/, "").slice(0, 200) ?? ""

class ToolRefusal extends Error {}

async function getWorkbench(scope: WorkbenchMcpScope) {
    const doc = scope.workbench
    const stage = asStage(doc.stage)
    const plans = plansOf(scope)
    const governing = governingPlan(plans, doc.approvedPlanVersion, stage)
    const attachments = await listWorkbenchAttachments(doc)
    return {
        tarefa: { codigo: doc.taskCode, titulo: doc.taskTitle },
        mesa: { tipo: doc.kind === "plugin" ? "plugin" : "repositório", etapa: workbenchStageLabel(stage, doc.kind === "plugin" ? "plugin" : "repo"), estado: doc.runState },
        ...(scope.fork ? { conversaAtual: `Fork ${scope.fork.number}` } : {}),
        branch: doc.branch,
        worktree: doc.worktreePath,
        ...(doc.kind === "plugin" && doc.plugin ? { plugin: { id: doc.plugin.pluginId, pastaDeTrabalho: doc.plugin.workDir } } : {}),
        plano: {
            versaoQueRegeAEtapa: governing?.plan.version ?? null,
            versaoAprovada: approvedPlan(plans, doc.approvedPlanVersion)?.version ?? null,
            versaoMaisRecente: plans.at(-1)?.version ?? null,
            versoes: plans.length,
        },
        forksIntegrados: (doc.forkNotes ?? []).map((note) => ({ fork: note.number, assunto: firstLine(note.summary) })),
        anexos: { mesa: attachments.filter((file) => file.source === "workbench").length, tarefa: attachments.filter((file) => file.source === "task").length },
        pullRequest: doc.pr ? { numero: doc.pr.number, url: doc.pr.url, estado: doc.pr.state } : null,
        previa: doc.previewUrl ? { url: doc.previewUrl, saudavel: doc.previewHealthy } : null,
    }
}

async function getTask(scope: WorkbenchMcpScope): Promise<string> {
    const { loadCentral } = await import("../centrals")
    const config = await loadCentral(scope.workbench.centralId).then((central) => central.config).catch(() => null)
    return workbenchTaskMarkdown(scope.workbench.taskId, config)
}

function getPlan(scope: WorkbenchMcpScope, version: number | "approved" | "latest" | undefined) {
    const plans = plansOf(scope)
    if (!plans.length) throw new ToolRefusal("A mesa ainda não tem plano escrito.")
    const doc = scope.workbench
    const plan =
        version === undefined
            ? governingPlan(plans, doc.approvedPlanVersion, asStage(doc.stage))!.plan
            : version === "latest"
              ? plans.at(-1)!
              : version === "approved"
                ? approvedPlan(plans, doc.approvedPlanVersion)
                : (plans.find((item) => item.version === version) ?? null)
    if (!plan) throw new ToolRefusal(version === "approved" ? "Nenhuma versão do plano foi aprovada ainda: use latest." : `A versão ${version} do plano não existe (versões: ${plans.map((item) => item.version).join(", ")}).`)
    const approved = approvedPlan(plans, doc.approvedPlanVersion)?.version === plan.version
    return [`# Plano da mesa ${doc.taskCode}: versão ${plan.version}${approved ? " (aprovada)" : ""} de ${plans.length}`, plan.feedback?.trim() ? `Pedido que originou esta versão: ${plan.feedback.trim()}` : "", iso(plan.createdAt) ? `Escrita em: ${iso(plan.createdAt)}` : "", "", plan.text.trim()].filter((line, index) => index > 2 || line).join("\n")
}

function listPlanVersions(scope: WorkbenchMcpScope) {
    const plans = plansOf(scope)
    const approved = approvedPlan(plans, scope.workbench.approvedPlanVersion)?.version ?? null
    return plans.map((plan) => ({ versao: plan.version, aprovada: plan.version === approved, escritaEm: iso(plan.createdAt), pedido: plan.feedback?.trim() || null, titulo: firstLine(plan.text) }))
}

async function listForks(scope: WorkbenchMcpScope) {
    const forks = await AgenticFork.find({ workbenchId: String(scope.workbench._id) }).select({ number: 1, status: 1, forkedFromStage: 1, summary: 1, parentNumber: 1, createdAt: 1 }).sort({ number: 1 }).lean<{ number: number; status: string; forkedFromStage: string; summary: string | null; parentNumber: number | null; createdAt: Date }[]>()
    const integrated = new Map((scope.workbench.forkNotes ?? []).map((note) => [note.number, note.summary]))
    return forks.map((fork) => ({
        fork: fork.number,
        ...(fork.parentNumber ? { deFork: fork.parentNumber } : {}),
        status: fork.status,
        abertoNaEtapa: workbenchStageLabel(asStage(fork.forkedFromStage)),
        abertoEm: iso(fork.createdAt),
        integradoAMesa: integrated.has(fork.number),
        resumo: integrated.get(fork.number) ?? fork.summary ?? null,
    }))
}

async function listAttachments(scope: WorkbenchMcpScope) {
    const files = await listWorkbenchAttachments(scope.workbench)
    return files.map((file) => ({ id: file.id, nome: file.name, origem: file.origin, tipo: file.mediaType, tamanho: formatAttachmentSize(file.size), enviadoEm: file.createdAt }))
}

async function getAttachment(scope: WorkbenchMcpScope, id: string): Promise<McpCallResult> {
    const file = (await listWorkbenchAttachments(scope.workbench)).find((item) => item.id === id)
    if (!file) throw new ToolRefusal(`Anexo ${id} não encontrado nesta mesa (veja list_attachments).`)
    const link = await attachmentLink(file)
    const downloadDir = agenticDownloadDir(scope.workbench.taskCode, scope.fork?.number)
    const content: McpCallResult["content"] = []
    let delivered: string | null = null
    const reasons: string[] = []
    if (file.kind === "text" || file.kind === "image") {
        const max = file.kind === "text" ? WORKBENCH_MCP_TEXT_MAX_BYTES : WORKBENCH_MCP_IMAGE_MAX_BYTES
        const read = await attachmentBytes(file, max)
        if (read.bytes && read.bytes.byteLength > 0) {
            if (file.kind === "text") content.push({ type: "text", text: `Conteúdo de ${file.name}:\n\n${Buffer.from(read.bytes).toString("utf8")}` })
            else content.push({ type: "image", data: Buffer.from(read.bytes).toString("base64"), mimeType: file.mediaType || "image/png" })
            delivered = file.kind === "text" ? "texto nesta resposta" : "imagem nesta resposta"
        } else if (read.reason) reasons.push(read.reason)
    } else {
        reasons.push("este tipo de arquivo não é entregue direto na resposta: baixe pelo link")
    }
    if (!link.url && link.reason) reasons.push(link.reason)
    const summary = {
        id: file.id,
        nome: file.name,
        origem: file.origin,
        tipo: file.mediaType,
        tamanho: formatAttachmentSize(file.size),
        conteudo: delivered ?? "não entregue nesta resposta",
        link: link.url,
        ...(link.url ? { comoBaixar: `mkdir -p ${downloadDir} && curl -fsSL -o "${downloadDir}/${file.name}" "<link>" (fora do worktree; nunca faça commit do arquivo). O link vale por 24 h: peça outro com get_attachment quando precisar.` } : {}),
        ...(reasons.length ? { motivos: reasons } : {}),
        ...(!delivered && !link.url ? { aviso: "O arquivo existe na mesa, mas não pôde ser entregue agora. Informe o usuário e siga com o que for possível." } : {}),
    }
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }, ...content] }
}

/** Executa uma ferramenta do MCP da mesa no escopo da sessão que chamou. */
export async function runWorkbenchTool(name: WorkbenchMcpToolName, rawArgs: Record<string, unknown>, scope: WorkbenchMcpScope): Promise<McpCallResult> {
    const parsed = INPUTS[name].safeParse(rawArgs)
    if (!parsed.success) return mcpTextResult(parsed.error.issues.map((issue) => issue.message).join("; "), true)
    try {
        switch (name) {
            case "get_workbench":
                return mcpTextResult(await getWorkbench(scope))
            case "get_task":
                return mcpTextResult(await getTask(scope))
            case "get_plan":
                return mcpTextResult(getPlan(scope, (parsed.data as { version?: number | "approved" | "latest" }).version))
            case "list_plan_versions":
                return mcpTextResult(listPlanVersions(scope))
            case "list_forks":
                return mcpTextResult(await listForks(scope))
            case "list_attachments":
                return mcpTextResult(await listAttachments(scope))
            case "get_attachment":
                return await getAttachment(scope, (parsed.data as { id: string }).id)
        }
    } catch (error) {
        if (error instanceof ToolRefusal) return mcpTextResult(error.message, true)
        throw error
    }
}
