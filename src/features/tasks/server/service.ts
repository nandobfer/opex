import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { AuditLog, type IAuditLog } from "@/lib/db/models/AuditLog"
import { DevTask, TaskComment, type IDevTask, type ITaskEstimate } from "@/lib/db/models/DevTask"
import { OrcamentoClient } from "@/lib/db/models/Orcamento"
import { Project, type IProject } from "@/lib/db/models/Project"
import { TimeLog } from "@/lib/db/models/TimeLog"
import { getLocalUser } from "@/lib/local-user"
import { runAfterResponse } from "@/lib/after-response"
import { appChannel, publishToChannels } from "@/lib/pusher/channels"
import { clientChannel } from "@/lib/pusher/channel-names"
import { TASK_AGENTIC_FLOW_INHERIT_LABEL, TASK_AGENTIC_FLOW_LABELS, TASK_PRIORITY_LABELS, TASK_TYPE_LABELS, TASKS_UPDATED_EVENT, type TaskAgenticFlow, type TaskPriority, type TaskType } from "../constants"
import { getBoard } from "./columns"
import { formatLineComment, parseLineComment, TASK_COMMENT_MAX } from "../line-comments/format"
import type { BulkTaskResult, BulkTasksInput, CommentInput, CreateTaskInput, MoveTaskInput, UpdateTaskEstimateInput, UpdateTaskInput } from "../schemas"
import type { ProjectRef, TaskDetailDto, TaskDto, TaskEstimate, TaskHistoryEntry, TaskListDto, TaskOptionsDto, TaskTimeLog } from "../types"
import { computeClientEstimate } from "@/features/orcamentos/logic"
import { CLIENTE_TASKS_UPDATED_EVENT } from "@/features/orcamentos/constants"
import { taskTagsSourceHash } from "@/features/ai/task-tags"
import { logger } from "@/lib/logger"

/**
 * Tarefas dO Opex — a fonte de verdade. CRUD sobre `dev_tasks`; o código é sequencial por projeto
 * (`{SIGLA}-{n}`). Módulo somente servidor.
 */

export const TASK_AUDIT_ENTITY = "Tarefa"

/** Campos da tarefa que refletem na issue do GitHub (título, descrição, tipo/prioridade → labels e coluna → estado). */
const GITHUB_SYNCED_FIELDS = ["title", "description", "taskType", "priority"] as const

// ── Mappers ────────────────────────────────────────────────────────────────

const OBJECT_ID = /^[a-f0-9]{24}$/i

const projectRef = (project: IProject | null): ProjectRef | null =>
    project ? { id: String((project as unknown as { _id: unknown })._id), name: project.name, repo: project.repo, sigla: project.sigla } : null

/** Snapshot da estimativa/orçamento da tarefa no formato do DTO (visões interna e do cliente). */
export function toEstimateDto(estimate: ITaskEstimate): TaskEstimate {
    return {
        hours: estimate.hours ?? 0,
        clientHours: estimate.clientHours ?? 0,
        billingBrl: estimate.billingBrl ?? 0,
        factor: estimate.factor ?? 1,
        hourlyRate: estimate.hourlyRate ?? 0,
        model: estimate.model ?? null,
        generatedAt: estimate.generatedAt ? new Date(estimate.generatedAt).toISOString() : null,
    }
}

export function toTaskDto(task: IDevTask & { _id: unknown }, project: IProject | null): TaskDto {
    return {
        id: String(task._id),
        code: task.code,
        columnId: task.columnId,
        order: task.order,
        title: task.title,
        summary: task.summary ?? null,
        tags: task.tags ?? [],
        taskType: (task.taskType as TaskType | null) ?? null,
        priority: (task.priority as TaskPriority) ?? "medium",
        archived: task.archived === true,
        project: projectRef(project),
        estimate: task.estimate ? toEstimateDto(task.estimate) : null,
        agenticFlow: (task.agenticFlow as TaskAgenticFlow | null) ?? null,
        createdAt: task.createdAt ? new Date(task.createdAt).toISOString() : null,
        updatedAt: task.updatedAt ? new Date(task.updatedAt).toISOString() : null,
    }
}

const FIELD_LABELS: Record<string, string> = {
    titulo: "título",
    descricao: "descrição",
    especificacao: "especificação técnica",
    tipo: "tipo",
    prioridade: "prioridade",
    projeto: "projeto",
    coluna: "coluna",
    arquivada: "arquivada",
    cliente: "cliente",
    fluxo: "fluxo da mesa",
    anexo: "anexos",
}

const ACTION_LABELS: Record<string, string> = {
    CRIAR: "criada",
    ATUALIZAR: "atualizada",
    MOVER: "movida",
    EXCLUIR: "excluída",
}

function describeAudit(log: Pick<IAuditLog, "acao" | "dadosAnteriores" | "dadosNovos">): string {
    const before = (log.dadosAnteriores ?? {}) as Record<string, unknown>
    const after = (log.dadosNovos ?? {}) as Record<string, unknown>
    const fromGithub = after.origem === "github"
    if (log.acao === "MOVER") {
        const from = before.coluna
        const to = after.coluna
        const text = from ? `Movida de "${String(from)}" para "${String(to)}"` : `Movida para "${String(to ?? "")}"`
        return fromGithub ? `Sincronizada do GitHub: ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text
    }
    if (log.acao === "CRIAR") return fromGithub ? `Tarefa criada do GitHub${after.titulo ? ` (${String(after.titulo)})` : ""}` : `Tarefa criada${after.titulo ? ` (${String(after.titulo)})` : ""}`
    if (log.acao === "EXCLUIR") return "Tarefa excluída"
    const changed = Object.keys(after).filter((key) => FIELD_LABELS[key] && String(before[key] ?? "") !== String(after[key] ?? ""))
    const label = changed.length ? changed.map((key) => FIELD_LABELS[key]).join(", ") : "campos"
    return fromGithub ? `Sincronizada do GitHub: alterou ${label}` : `Alterou ${label}`
}

async function historyFor(taskId: string): Promise<TaskHistoryEntry[]> {
    const logs = await AuditLog.find({ entidade: TASK_AUDIT_ENTITY, entidadeId: taskId }).sort({ timestamp: -1 }).limit(200).lean()
    return logs.map((log) => ({
        id: String(log._id),
        action: ACTION_LABELS[log.acao] ?? log.acao,
        description: describeAudit(log),
        createdAt: log.timestamp ? new Date(log.timestamp).toISOString() : null,
    }))
}

async function timeLogsFor(taskId: string): Promise<{ logs: TaskTimeLog[]; total: number }> {
    const docs = await TimeLog.find({ taskId }).sort({ startTime: -1 }).lean()
    const logs = docs.map((doc) => ({
        id: String(doc._id),
        startTime: doc.startTime ? new Date(doc.startTime).toISOString() : null,
        endTime: doc.endTime ? new Date(doc.endTime).toISOString() : null,
        duration: doc.duration ?? null,
        description: doc.description ?? null,
        active: doc.active === true,
        agent: doc.agent ?? null,
        model: doc.model ?? null,
        costUsd: doc.costUsd ?? 0,
        inputTokens: doc.inputTokens ?? 0,
        outputTokens: doc.outputTokens ?? 0,
        reasoningTokens: doc.reasoningTokens ?? 0,
    }))
    const total = docs.reduce((sum, doc) => sum + (doc.active ? 0 : (doc.duration ?? 0)), 0)
    return { logs, total }
}

async function withIssueRefs<T extends TaskDto>(tasks: T[]): Promise<T[]> {
    if (tasks.length === 0) return tasks
    const { issueRefsFor } = await import("@/features/github/server/issue-links")
    const refs = await issueRefsFor(tasks.map((task) => task.id))
    return refs.size ? tasks.map((task) => (refs.has(task.id) ? { ...task, issue: refs.get(task.id)! } : task)) : tasks
}

/**
 * Cliente de orçamento que originou a tarefa: o ativo cujo `projectIds` inclui o repositório dela.
 * Uma tarefa com estimativa vem de um cliente só; havendo mais de um, usa o atualizado por último.
 */
async function resolveProjectClient(projectId: string): Promise<{ name: string; profitFactor: number; hourlyRate: number } | null> {
    const client = await OrcamentoClient.findOne({ projectIds: projectId, active: { $ne: false } })
        .sort({ updatedAt: -1 })
        .lean()
    if (!client) return null
    return { name: client.name, profitFactor: Math.max(1, client.profitFactor ?? 1), hourlyRate: Math.max(0, client.hourlyRate ?? 0) }
}

/**
 * Cliente de orçamento da tarefa: o `clientId` **gravado nela** tem precedência. Sem cliente
 * explícito (`null` — tarefa do dono ou cliente removido), **não** há inflação; apenas registros
 * **legados** (sem o campo `clientId`) caem no cliente ativo que inclui o repositório.
 */
export async function resolveTaskClient(task: { clientId?: string | null; projectId: string }): Promise<{ name: string; profitFactor: number; hourlyRate: number } | null> {
    if (task.clientId) {
        const client = await OrcamentoClient.findById(task.clientId).lean()
        if (client) {
            return { name: client.name, profitFactor: Math.max(1, client.profitFactor ?? 1), hourlyRate: Math.max(0, client.hourlyRate ?? 0) }
        }
    }
    if (task.clientId === null) return null
    return resolveProjectClient(task.projectId)
}

// ── Consultas ──────────────────────────────────────────────────────────────

export async function listTasks(includeArchived: boolean): Promise<TaskListDto> {
    await dbConnect()
    const docs = await DevTask.find(includeArchived ? {} : { archived: { $ne: true } }).sort({ columnId: 1, order: 1 }).lean()
    const projects = new Map((await Project.find({ _id: { $in: [...new Set(docs.map((task) => task.projectId))] } }).lean()).map((project) => [String(project._id), project]))
    const tasks = docs.map((task) => toTaskDto(task, projects.get(task.projectId) ?? null))
    return { tasks: await withIssueRefs(tasks), fetchedAt: new Date().toISOString() }
}

/** Tarefas dos repositórios de um cliente (portal). SOMENTE servidor. */
export async function listTasksForClient(clientId: string, includeArchived: boolean): Promise<TaskListDto> {
    await dbConnect()
    const docs = await DevTask.find({ clientId, ...(includeArchived ? {} : { archived: { $ne: true } }) })
        .sort({ columnId: 1, order: 1 })
        .lean()
    const projects = new Map((await Project.find({ _id: { $in: [...new Set(docs.map((task) => task.projectId))] } }).lean()).map((project) => [String(project._id), project]))
    const tasks = docs.map((task) => toTaskDto(task, projects.get(task.projectId) ?? null))
    return { tasks: await withIssueRefs(tasks), fetchedAt: new Date().toISOString() }
}

export async function getTask(id: string): Promise<TaskDetailDto> {
    assertTaskId(id)
    await dbConnect()
    const task = await DevTask.findById(id).lean()
    if (!task) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
    const project = await Project.findById(task.projectId).lean()
    const [comments, history, time] = await Promise.all([
        TaskComment.find({ taskId: id }).sort({ createdAt: 1 }).lean(),
        historyFor(id),
        timeLogsFor(id),
    ])
    const [withIssue] = await withIssueRefs([toTaskDto(task, project)])
    const estimateClientName = withIssue.estimate ? (await resolveTaskClient(task))?.name ?? null : null
    const { countTaskAttachments } = await import("@/features/tasks/attachments/server/service")
    const attachmentsCount = await countTaskAttachments(id)
    return {
        ...withIssue,
        clientId: task.clientId ?? null,
        estimateClientName,
        attachmentsCount,
        description: task.description ?? null,
        technicalSpec: task.technicalSpec ?? null,
        comments: comments.map((comment) => ({
            id: String(comment._id),
            ...parseLineComment(comment.content),
            authorType: comment.authorType === "client" ? "client" : "owner",
            authorName: comment.authorName ?? (comment.authorType === "client" ? "Cliente" : getLocalUser().name),
            createdAt: comment.createdAt ? new Date(comment.createdAt).toISOString() : null,
        })),
        history,
        timeLogs: time.logs,
        totalTimeLogged: time.total,
    }
}

export async function getTaskOptions(): Promise<TaskOptionsDto> {
    await dbConnect()
    const projects = await Project.find().sort({ name: 1 }).lean()
    return { projects: projects.map((project) => projectRef(project)!).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) }
}

/**
 * Colunas de conclusão dos vínculos de projeto (Integrações › GitHub): uma tarefa nelas é
 * considerada concluída. Usado para varrer só as tarefas não concluídas (ex.: resumos de IA).
 */
export async function concludedColumnKeys(): Promise<string[]> {
    await dbConnect()
    const keys = (await Project.find({ closedColumnKey: { $ne: null } })
        .select({ closedColumnKey: 1 })
        .lean())
        .map((project) => project.closedColumnKey)
        .filter((key): key is string => Boolean(key))
    return [...new Set(keys)]
}

// ── Mutações ───────────────────────────────────────────────────────────────

const assertTaskId = (id: string) => {
    if (!OBJECT_ID.test(id)) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
}

/**
 * Avisa o desenvolvimento agêntico que tarefas mudaram de coluna: as que caíram na coluna da fila
 * de uma central podem abrir a mesa na hora. Roda depois da resposta (nunca atrasa a requisição).
 */
function notifyAgenticQueue(ids: string[]): void {
    if (!ids.length) return
    runAfterResponse("agentic-queue", async () => {
        const { notifyTasksColumnChanged } = await import("@/features/agentic/server/queue")
        await notifyTasksColumnChanged(ids)
    })
}

/**
 * Empurra a tarefa para a issue vinculada (Integrações › GitHub) após uma mutação. É a **fonte única**
 * do disparo: qualquer caminho (rotas, lote e a mesa de trabalho agêntica) fecha/reabre a issue
 * conforme a coluna. A importação é dinâmica para evitar o ciclo estático com `github/task-sync`.
 * Só é chamado quando algo relevante para a issue mudou e nunca na sincronização vinda do GitHub
 * (`origin: "github"`), para não ecoar de volta.
 */
async function syncGithubIssue(id: string): Promise<void> {
    const { pushTasksToIssues } = await import("@/features/github/server/task-sync")
    await pushTasksToIssues([id])
}

/**
 * Alinha a visibilidade dos anexos ao cliente da tarefa (o cliente do portal vê os anexos das
 * tarefas dele). Import dinâmico: os anexos publicam eventos por este módulo.
 */
async function syncAttachmentsClient(taskId: string, clientId: string | null): Promise<void> {
    const { syncTaskAttachmentsClient } = await import("@/features/tasks/attachments/server/service")
    await syncTaskAttachmentsClient(taskId, clientId)
}

async function assertColumn(key: string): Promise<void> {
    const board = await getBoard()
    if (!board.columns.some((column) => column.key === key)) throw new DomainError(400, "Coluna inválida", "COLUMN_NOT_FOUND")
}

export { assertColumn }

async function endOrder(columnId: string, exceptId?: string): Promise<number> {
    const last = await DevTask.findOne({ columnId, ...(exceptId ? { _id: { $ne: exceptId } } : {}) })
        .sort({ order: -1 })
        .select({ order: 1 })
        .lean()
    return (last?.order ?? -1) + 1
}

/** Aloca o próximo código do projeto (`{SIGLA}-{n}`), incrementando `taskSeq` atomicamente. */
export async function nextProjectCode(project: IProject): Promise<string> {
    const updated = await Project.findOneAndUpdate({ _id: (project as unknown as { _id: unknown })._id }, { $inc: { taskSeq: 1 } }, { returnDocument: "after" }).lean()
    const seq = updated?.taskSeq ?? project.taskSeq + 1
    return `${project.sigla}-${seq}`
}

export interface CreateTaskOptions {
    /** Id do usuário para a auditoria (padrão: rotinas usam "system"). */
    actorId: string
    /** Força a ordem (usado por rotinas). Sem isto, vai para o fim da coluna. */
    order?: number
    /** Origem da criação (a sincronização marca "github"; o portal do cliente marca "client"). */
    origin?: "opex" | "github" | "client"
    /** Cliente de orçamento que solicitou a tarefa (portal). */
    clientId?: string
    /** Estimativa/orçamento vinda do portal do cliente (snapshot). */
    estimate?: TaskEstimateInput
    /** Tags já conhecidas (ex.: vindas do portal, para não gerar de novo). */
    tags?: string[]
}

/** Estimativa gravada na tarefa ao aprovar a prévia do portal. */
export interface TaskEstimateInput {
    hours: number
    clientHours: number
    billingBrl: number
    factor: number
    hourlyRate: number
    model: string | null
}

export async function createTask(input: CreateTaskInput, options: CreateTaskOptions): Promise<TaskDto> {
    await dbConnect()
    const project = await Project.findById(input.projectId).lean()
    if (!project) throw new DomainError(400, "Projeto inválido", "PROJECT_NOT_FOUND")
    await assertColumn(input.columnId)
    const code = await nextProjectCode(project)
    const order = options.order ?? (await endOrder(input.columnId))
    const task = await DevTask.create({
        code,
        projectId: input.projectId,
        columnId: input.columnId,
        order,
        title: input.title,
        description: input.description?.trim() || null,
        technicalSpec: input.technicalSpec?.trim() || null,
        taskType: input.taskType ?? null,
        priority: input.priority ?? "medium",
        archived: false,
        clientId: options.clientId ?? null,
        tags: options.tags ?? [],
        tagsSourceHash: options.tags ? taskTagsSourceHash({ title: input.title, description: input.description?.trim() || null }) : null,
        estimate: options.estimate ? { ...options.estimate, generatedAt: new Date() } : null,
    })
    await recordAudit({
        userId: options.actorId,
        entidade: TASK_AUDIT_ENTITY,
        entidadeId: String(task._id),
        acao: AcaoAuditoria.CRIAR,
        depois: { codigo: code, titulo: task.title, projeto: project.name, coluna: input.columnId, ...(options.origin && options.origin !== "opex" ? { origem: options.origin } : {}) },
    })
    await publishTasksUpdated([String(task._id)])
    notifyAgenticQueue([String(task._id)])
    return toTaskDto(task.toObject(), project)
}

export async function updateTask(id: string, input: UpdateTaskInput, actorId: string, options: { publish?: boolean; origin?: "opex" | "github" | "client" } = {}): Promise<void> {
    assertTaskId(id)
    await dbConnect()
    const task = await DevTask.findById(id).lean()
    if (!task) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")

    const before: Record<string, unknown> = { codigo: task.code, titulo: task.title }
    const after: Record<string, unknown> = { codigo: task.code }
    const set: Record<string, unknown> = {}
    let columnChanged = false

    if (input.title !== undefined) {
        set.title = input.title
        after.titulo = input.title
    }
    if (input.description !== undefined) {
        set.description = input.description?.trim() || null
        after.descricao = "alterada"
    }
    if (input.technicalSpec !== undefined) {
        set.technicalSpec = input.technicalSpec?.trim() || null
        after.especificacao = "alterada"
    }
    if (input.taskType !== undefined) {
        set.taskType = input.taskType
        before.tipo = task.taskType ? TASK_TYPE_LABELS[task.taskType as TaskType] : null
        after.tipo = input.taskType ? TASK_TYPE_LABELS[input.taskType] : null
    }
    if (input.priority !== undefined) {
        set.priority = input.priority
        before.prioridade = TASK_PRIORITY_LABELS[task.priority as TaskPriority]
        after.prioridade = TASK_PRIORITY_LABELS[input.priority]
    }
    if (input.projectId !== undefined && input.projectId !== task.projectId) {
        const project = await Project.findById(input.projectId).lean()
        if (!project) throw new DomainError(400, "Projeto inválido", "PROJECT_NOT_FOUND")
        set.projectId = input.projectId
        after.projeto = project.name
    }
    if (input.columnId !== undefined && input.columnId !== task.columnId) {
        await assertColumn(input.columnId)
        set.columnId = input.columnId
        set.order = await endOrder(input.columnId, id)
        after.coluna = input.columnId
        columnChanged = true
    }
    if (input.agenticFlow !== undefined) {
        set.agenticFlow = input.agenticFlow
        before.fluxo = task.agenticFlow ? TASK_AGENTIC_FLOW_LABELS[task.agenticFlow as TaskAgenticFlow] : TASK_AGENTIC_FLOW_INHERIT_LABEL
        after.fluxo = input.agenticFlow ? TASK_AGENTIC_FLOW_LABELS[input.agenticFlow] : TASK_AGENTIC_FLOW_INHERIT_LABEL
    }

    if (Object.keys(set).length === 0) return
    if (options.origin && options.origin !== "opex") after.origem = options.origin
    await DevTask.updateOne({ _id: id }, { $set: set })
    await recordAudit({ userId: actorId, entidade: TASK_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: before, depois: after })
    if (options.publish !== false) await publishTasksUpdated([id])
    if (options.publish !== false && columnChanged) notifyAgenticQueue([id])
    if (options.origin !== "github" && (columnChanged || GITHUB_SYNCED_FIELDS.some((field) => field in set))) await syncGithubIssue(id)
}

/**
 * Edita as horas estimadas de uma tarefa (existe ou não estimativa prévia): recalcula o prazo do
 * cliente (`H × fator`) e o faturamento (`horas do cliente × custo/hora`) com o fator e o custo/hora
 * **atuais** do cliente da tarefa. **Sem cliente**, o snapshot fica neutro (fator 1, custo 0) e só
 * as horas reais valem — a edição cria a estimativa quando a tarefa ainda não tinha.
 */
export async function updateTaskEstimate(id: string, input: UpdateTaskEstimateInput, actorId: string): Promise<TaskEstimate> {
    assertTaskId(id)
    await dbConnect()
    const task = await DevTask.findById(id).lean()
    if (!task) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")

    const client = await resolveTaskClient(task)
    const factor = client ? client.profitFactor : 1
    const hourlyRate = client ? client.hourlyRate : 0
    const next = computeClientEstimate(input.hours, factor, hourlyRate)
    const estimate: ITaskEstimate = {
        hours: next.hours,
        clientHours: next.clientHours,
        billingBrl: next.billingBrl,
        factor,
        hourlyRate,
        model: task.estimate?.model ?? null,
        generatedAt: task.estimate?.generatedAt ? new Date(task.estimate.generatedAt) : new Date(),
    }

    await DevTask.updateOne({ _id: id }, { $set: { estimate } })
    await recordAudit({
        userId: actorId,
        entidade: TASK_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { codigo: task.code, horasEstimadas: task.estimate?.hours ?? 0, faturamentoEstimado: task.estimate?.billingBrl ?? 0 },
        depois: { codigo: task.code, horasEstimadas: next.hours, faturamentoEstimado: next.billingBrl },
    })
    await publishTasksUpdated([id])
    return toEstimateDto(estimate)
}

/**
 * Define, troca ou remove o cliente da tarefa. Ao definir/trocar, recalcula a estimativa com o fator
 * de lucro e o custo/hora do cliente escolhido, **preservando as horas** já estimadas (ou `0` quando
 * ainda não havia estimativa); ao remover (`null`), **preserva as horas reais** e zera a inflação
 * (fator 1, custo 0) — a estimativa só desaparece se a tarefa não tinha nenhuma. Só aceita cliente
 * **ativo** que inclua o repositório da tarefa (mesma regra do portal).
 */
export async function setTaskClient(id: string, clientId: string | null, actorId: string): Promise<{ clientId: string | null; estimate: TaskEstimate | null }> {
    assertTaskId(id)
    await dbConnect()
    const task = await DevTask.findById(id).lean()
    if (!task) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")

    const beforeName = (await resolveTaskClient(task))?.name ?? null

    if (clientId === null) {
        if ((task.clientId ?? null) === null && !task.estimate) return { clientId: null, estimate: null }
        // Preserva as horas reais; sem cliente, o fator e o custo/hora ficam neutros (não infla).
        const hours = task.estimate?.hours ?? 0
        const estimate: ITaskEstimate | null = task.estimate
            ? { hours, clientHours: hours, billingBrl: 0, factor: 1, hourlyRate: 0, model: task.estimate.model ?? null, generatedAt: task.estimate.generatedAt ? new Date(task.estimate.generatedAt) : new Date() }
            : null
        await DevTask.updateOne({ _id: id }, { $set: { clientId: null, estimate } })
        // A visibilidade dos anexos acompanha o cliente da tarefa.
        await syncAttachmentsClient(id, null)
        await recordAudit({
            userId: actorId,
            entidade: TASK_AUDIT_ENTITY,
            entidadeId: id,
            acao: AcaoAuditoria.ATUALIZAR,
            antes: { codigo: task.code, cliente: beforeName },
            depois: { codigo: task.code, cliente: null, estimativa: estimate ? "mantida (sem cliente)" : "removida" },
        })
        await publishTasksUpdated([id])
        return { clientId: null, estimate: estimate ? toEstimateDto(estimate) : null }
    }

    const client = await OrcamentoClient.findById(clientId).lean()
    if (!client) throw new DomainError(404, "Cliente não encontrado", "CLIENT_NOT_FOUND")
    if (client.active === false) throw new DomainError(400, "O cliente está inativo", "CLIENT_INACTIVE")
    if (!(client.projectIds ?? []).includes(task.projectId)) throw new DomainError(400, "O cliente não inclui o repositório da tarefa", "CLIENT_NOT_FOR_PROJECT")

    const factor = Math.max(1, client.profitFactor ?? 1)
    const hourlyRate = Math.max(0, client.hourlyRate ?? 0)
    const next = computeClientEstimate(task.estimate?.hours ?? 0, factor, hourlyRate)
    const estimate: ITaskEstimate = {
        hours: next.hours,
        clientHours: next.clientHours,
        billingBrl: next.billingBrl,
        factor,
        hourlyRate,
        model: task.estimate?.model ?? null,
        generatedAt: task.estimate?.generatedAt ? new Date(task.estimate.generatedAt) : new Date(),
    }

    await DevTask.updateOne({ _id: id }, { $set: { clientId, estimate } })
    // A visibilidade dos anexos acompanha o cliente da tarefa.
    await syncAttachmentsClient(id, clientId)
    await recordAudit({
        userId: actorId,
        entidade: TASK_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { codigo: task.code, cliente: beforeName },
        depois: { codigo: task.code, cliente: client.name, fatorLucro: factor, horasEstimadas: next.hours },
    })
    await publishTasksUpdated([id])
    return { clientId, estimate: toEstimateDto(estimate) }
}

/** Mover a tarefa de coluna (e, opcionalmente, posição). */
export async function moveTask(id: string, input: MoveTaskInput, actorId: string, options: { publish?: boolean; origin?: "opex" | "github" } = {}): Promise<TaskDto | null> {
    assertTaskId(id)
    await dbConnect()
    const task = await DevTask.findById(id).lean()
    if (!task) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
    if (input.targetColumn === task.columnId && input.order === undefined) return null
    await assertColumn(input.targetColumn)
    const order = input.order ?? (input.targetColumn === task.columnId ? task.order : await endOrder(input.targetColumn, id))

    const columnNames = new Map((await getBoard()).columns.map((column) => [column.key, column.name]))
    await DevTask.updateOne({ _id: id }, { $set: { columnId: input.targetColumn, order } })
    await recordAudit({
        userId: actorId,
        entidade: TASK_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.MOVER,
        antes: { codigo: task.code, coluna: columnNames.get(task.columnId) ?? task.columnId },
        depois: { codigo: task.code, coluna: columnNames.get(input.targetColumn) ?? input.targetColumn, ordem: order, ...(options.origin === "github" ? { origem: "github" } : {}) },
    })
    if (options.publish !== false) await publishTasksUpdated([id])
    if (options.publish !== false && input.targetColumn !== task.columnId) notifyAgenticQueue([id])
    if (options.origin !== "github" && input.targetColumn !== task.columnId) await syncGithubIssue(id)
    const updated = await DevTask.findById(id).lean()
    const project = updated ? await Project.findById(updated.projectId).lean() : null
    return updated ? toTaskDto(updated, project) : null
}

export async function setTaskArchived(id: string, archive: boolean, actorId: string, options: { publish?: boolean } = {}): Promise<void> {
    assertTaskId(id)
    await dbConnect()
    const task = await DevTask.findById(id).lean()
    if (!task) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
    await DevTask.updateOne({ _id: id }, { $set: { archived: archive } })
    await recordAudit({
        userId: actorId,
        entidade: TASK_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { codigo: task.code, arquivada: !archive },
        depois: { codigo: task.code, arquivada: archive },
    })
    if (options.publish !== false) await publishTasksUpdated([id])
}

export async function deleteTask(id: string, actorId: string): Promise<void> {
    assertTaskId(id)
    await dbConnect()
    const task = await DevTask.findById(id).lean()
    if (!task) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
    await Promise.all([DevTask.deleteOne({ _id: id }), TaskComment.deleteMany({ taskId: id }), TimeLog.deleteMany({ taskId: id })])
    const { GithubIssueLink } = await import("@/lib/db/models/Github")
    await GithubIssueLink.updateMany({ taskId: id }, { $unset: { taskId: "" } })
    // Os anexos da tarefa (objetos no storage + registros) somem junto, fora da resposta.
    runAfterResponse("attachments-cleanup", async () => {
        const { deleteAttachmentsForTask } = await import("@/features/tasks/attachments/server/service")
        await deleteAttachmentsForTask(id)
    })
    // O refinamento de IA da tarefa some junto (melhor esforço, fora da resposta).
    runAfterResponse("refinement-cleanup", async () => {
        const { deleteRefinementForTask } = await import("@/features/refinement/server/service")
        await deleteRefinementForTask(id)
    })
    await recordAudit({ userId: actorId, entidade: TASK_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { codigo: task.code, titulo: task.title } })
    await publishTasksUpdated([id])
}

/** Autor de um comentário (origem + nome exibido). */
export interface CommentAuthor {
    /** Identificador para a auditoria (dono: `local`; cliente: nome do cliente). */
    id: string
    type: "owner" | "client"
    /** Nome exibido do autor. */
    name: string
}

/**
 * Comentário na tarefa. Com `lineRef` (só o dono), vira comentário de linha: citação visível +
 * marcador oculto (`line-comments/format`).
 */
export async function addComment(taskId: string, input: string | CommentInput, author: CommentAuthor): Promise<void> {
    assertTaskId(taskId)
    await dbConnect()
    if (!(await DevTask.exists({ _id: taskId }))) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
    const { content: text, lineRef } = typeof input === "string" ? { content: input, lineRef: undefined } : input
    let content = text.trim()
    if (lineRef) {
        try {
            content = formatLineComment(content, lineRef)
        } catch {
            throw new DomainError(400, `O comentário com a citação da linha passa de ${TASK_COMMENT_MAX} caracteres. Encurte o texto.`, "COMMENT_TOO_LONG")
        }
    }
    await TaskComment.create({ taskId, content, authorType: author.type, authorName: author.name })
    await recordAudit({
        userId: author.id,
        entidade: TASK_AUDIT_ENTITY,
        entidadeId: taskId,
        acao: AcaoAuditoria.ATUALIZAR,
        depois: { comentario: "adicionado", ...(lineRef && { linha: { campo: lineRef.field, comentarioId: lineRef.commentId ?? null, numero: lineRef.line, ...(lineRef.selection && { trecho: lineRef.selection.text.slice(0, 200), linhas: lineRef.selection.lines }) } }) },
    })
    await publishTasksUpdated([taskId])
}

// ── Lote ───────────────────────────────────────────────────────────────────

/** Tarefas processadas em paralelo. */
export const BULK_CONCURRENCY = 4

export async function runBulkTasks(input: BulkTasksInput, actorId: string): Promise<BulkTaskResult[]> {
    const results: BulkTaskResult[] = new Array(input.items.length)
    let next = 0
    const worker = async () => {
        while (next < input.items.length) {
            const index = next++
            const item = input.items[index]!
            try {
                const { action } = item
                if (action.type === "move") await moveTask(item.id, { targetColumn: action.column, order: action.order }, actorId, { publish: false })
                else if (action.type === "priority") await updateTask(item.id, { priority: action.priority }, actorId, { publish: false })
                else await setTaskArchived(item.id, action.archive, actorId, { publish: false })
                results[index] = { id: item.id, ok: true }
            } catch (error) {
                results[index] = { id: item.id, ok: false, error: error instanceof Error ? error.message : "Falha ao atualizar a tarefa" }
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, input.items.length) }, worker))
    await publishTasksUpdated(results.filter((result) => result.ok).map((result) => result.id))
    notifyAgenticQueue(results.filter((result, index) => result.ok && input.items[index]?.action.type === "move").map((result) => result.id))
    return results
}

export async function publishTasksUpdated(ids: string[]): Promise<void> {
    if (!ids.length) return
    await publishToChannels([appChannel()], TASKS_UPDATED_EVENT, { ids })
    // O portal do cliente também precisa saber: publica no canal do cliente de cada tarefa afetada.
    try {
        const tasks = await DevTask.find({ _id: { $in: ids } })
            .select({ clientId: 1 })
            .lean()
        const clientIds = [...new Set(tasks.map((task) => task.clientId).filter((id): id is string => Boolean(id)))]
        if (clientIds.length) await publishToChannels(clientIds.map((clientId) => clientChannel(clientId)), CLIENTE_TASKS_UPDATED_EVENT, { ids })
    } catch (error) {
        logger.warn({ err: error }, "[pusher] Falha ao publicar no canal do cliente")
    }
}

// ── Uso por rotinas (sync do GitHub) ───────────────────────────────────────

/** Cria a tarefa a partir de uma issue do GitHub (rotina). Devolve o DTO criado. */
export async function createTaskFromIssue(input: { title: string; description: string; projectId: string; columnId: string; taskType: TaskType | null; priority: TaskPriority }): Promise<TaskDto> {
    return createTask({ ...input, taskType: input.taskType, priority: input.priority }, { actorId: "system", origin: "github" })
}
