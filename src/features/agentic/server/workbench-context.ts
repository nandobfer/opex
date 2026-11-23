import mongoose from "mongoose"
import type { OpencodeClient } from "@/lib/ai/opencode-client"
import type { IAgenticWorkbench } from "@/lib/db/models/Agentic"
import { logger } from "@/lib/logger"
import type { WorkbenchStage } from "../constants"
import type { CentralConfig } from "../schemas"
import { ensureWorkbenchMcp } from "./workbench-mcp/register"
import { workbenchContextFallback, workbenchContextHeader, type FallbackAttachment, type WorkbenchContextSource } from "../workbench-context"

/**
 * Contexto da mesa no turno (OPE-178): registra o MCP `opex_mesa` nos diretórios da sessão e devolve o
 * cabeçalho do prompt. Sem o MCP, devolve também o pacote completo (plano, versões, forks, tarefa e
 * anexos com link gerado agora) para ir no prompt. NUNCA lança nem derruba a etapa: na pior hipótese o
 * turno segue com o cabeçalho e o plano montados com o que já está carregado.
 */

export interface WorkbenchTurnContext {
    header: string
    fallback: string | null
    mcp: boolean
}

export interface WorkbenchTurnContextInput {
    workbench: IAgenticWorkbench
    stage: WorkbenchStage
    config?: Pick<CentralConfig, "include"> | null
    directories: readonly (string | null | undefined)[]
    downloadDir: string
    fork?: { number: number } | null
    newSession?: boolean
    requirePlan?: boolean
    notify?: (level: "warn", message: string) => void
}

/** Prazo de cada consulta auxiliar do contexto: o turno nunca fica preso esperando por ela. */
export const WORKBENCH_CONTEXT_DEADLINE_MS = 8_000

function withDeadline<T>(promise: Promise<T>, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    return Promise.race([promise, new Promise<T>((resolve) => (timer = setTimeout(() => resolve(fallback), WORKBENCH_CONTEXT_DEADLINE_MS)))]).finally(() => clearTimeout(timer))
}

const dbReady = () => mongoose.connection.readyState === 1

function sourceOf(input: WorkbenchTurnContextInput, attachments: WorkbenchContextSource["attachments"]): WorkbenchContextSource {
    const doc = input.workbench
    return {
        code: doc.taskCode,
        title: doc.taskTitle,
        stage: input.stage,
        kind: doc.kind === "plugin" ? "plugin" : "repo",
        branch: doc.kind === "plugin" ? null : doc.branch,
        worktreePath: doc.kind === "plugin" ? (doc.plugin?.workDir ?? null) : doc.worktreePath,
        sessionDirectory: doc.sessionDirectory,
        plans: doc.plans ?? [],
        approvedPlanVersion: doc.approvedPlanVersion ?? null,
        forkNotes: doc.forkNotes ?? [],
        pr: doc.pr ? { number: doc.pr.number, url: doc.pr.url, state: doc.pr.state } : null,
        previewUrl: doc.previewUrl ?? null,
        attachments,
        fork: input.fork ?? null,
    }
}

/** Tarefa e anexos do pacote de degradação (melhor esforço; sem banco conectado, só o que está na mesa). */
async function fallbackExtras(input: WorkbenchTurnContextInput): Promise<{ taskMarkdown: string | null; attachments: FallbackAttachment[] }> {
    if (!dbReady()) return { taskMarkdown: null, attachments: [] }
    const data = await import("./workbench-mcp/data")
    const [taskMarkdown, files] = await Promise.all([
        data.workbenchTaskMarkdown(input.workbench.taskId, input.config ?? null).catch(() => null),
        data.listWorkbenchAttachments(input.workbench).catch(() => []),
    ])
    const attachments = await Promise.all(files.map(async (file) => ({ name: file.name, mediaType: file.mediaType, size: file.size, origin: file.origin, ...(await data.attachmentLink(file)) })))
    return { taskMarkdown, attachments }
}

export async function syncWorkbenchContext(client: OpencodeClient, input: WorkbenchTurnContextInput): Promise<WorkbenchTurnContext> {
    const workbenchId = String(input.workbench._id)
    const options = { newSession: input.newSession, requirePlan: input.requirePlan }
    try {
        // Sem banco conectado (scripts, testes), o cabeçalho só omite a contagem dos anexos.
        const countAttachments = async () => (dbReady() ? (await import("./workbench-mcp/data")).countWorkbenchAttachments(input.workbench) : null)
        const [registration, counts] = await Promise.all([withDeadline(ensureWorkbenchMcp(client, input.directories), { ok: false, error: "o OpenCode não confirmou o registro a tempo", skipped: [] }), withDeadline(countAttachments().catch(() => null), null)])
        const source = sourceOf(input, counts)
        const header = workbenchContextHeader(source, { mcp: registration.ok, ...options })
        if (registration.ok) return { header, fallback: null, mcp: true }
        logger.warn({ workbenchId, err: registration.error }, "[agentic] MCP da mesa indisponível neste turno: os dados da mesa vão no prompt")
        input.notify?.("warn", `Ferramentas da mesa indisponíveis neste turno (${registration.error ?? "motivo desconhecido"}): o plano e os dados da mesa vão no prompt.`)
        const extras = await withDeadline(fallbackExtras(input).catch(() => ({ taskMarkdown: null, attachments: [] })), { taskMarkdown: null, attachments: [] })
        return { header, fallback: workbenchContextFallback(source, { ...extras, downloadDir: input.downloadDir }), mcp: false }
    } catch (error) {
        logger.warn({ workbenchId, err: error instanceof Error ? error.message : error }, "[agentic] não foi possível montar o contexto da mesa; o turno segue com o plano no prompt")
        const source = sourceOf(input, null)
        return { header: workbenchContextHeader(source, { mcp: false, ...options }), fallback: workbenchContextFallback(source), mcp: false }
    }
}
