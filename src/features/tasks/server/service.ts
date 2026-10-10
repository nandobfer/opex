import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { AuditLog, type IAuditLog } from "@/lib/db/models/AuditLog"
import { DevTask, TaskComment, type IDevTask } from "@/lib/db/models/DevTask"
import { Project, type IProject } from "@/lib/db/models/Project"
import { TimeLog } from "@/lib/db/models/TimeLog"
import { runAfterResponse } from "@/lib/after-response"
import { appChannel, publishToChannels } from "@/lib/pusher/channels"
import { TASK_PRIORITY_LABELS, TASK_TYPE_LABELS, TASKS_UPDATED_EVENT, type TaskPriority, type TaskType } from "../constants"
import { getBoard } from "./columns"
import type { BulkTaskResult, BulkTasksInput, CreateTaskInput, MoveTaskInput, UpdateTaskInput } from "../schemas"
import type { ProjectRef, TaskDetailDto, TaskDto, TaskHistoryEntry, TaskListDto, TaskOptionsDto, TaskTimeLog } from "../types"

/**
 * Tarefas dO Opex — a fonte de verdade. CRUD sobre `dev_tasks`; o código é sequencial por projeto
 * (`{SIGLA}-{n}`). Módulo somente servidor.
 */

export const TASK_AUDIT_ENTITY = "Tarefa"

// ── Mappers ────────────────────────────────────────────────────────────────

const OBJECT_ID = /^[a-f0-9]{24}$/i

const projectRef = (project: IProject | null): ProjectRef | null =>
    project ? { id: String((project as unknown as { _id: unknown })._id), name: project.name, repo: project.repo, sigla: project.sigla } : null

export function toTaskDto(task: IDevTask & { _id: unknown }, project: IProject | null): TaskDto {
    return {
        id: String(task._id),
        code: task.code,
        columnId: task.columnId,
        order: task.order,
        title: task.title,
        taskType: (task.taskType as TaskType | null) ?? null,
        priority: (task.priority as TaskPriority) ?? "medium",
        archived: task.archived === true,
        project: projectRef(project),
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
    if (log.acao === "MOVER") {
        const from = before.coluna
        const to = after.coluna
        return from ? `Movida de "${String(from)}" para "${String(to)}"` : `Movida para "${String(to ?? "")}"`
    }
    if (log.acao === "CRIAR") return `Tarefa criada${after.titulo ? ` (${String(after.titulo)})` : ""}`
    if (log.acao === "EXCLUIR") return "Tarefa excluída"
    const changed = Object.keys(after).filter((key) => FIELD_LABELS[key] && String(before[key] ?? "") !== String(after[key] ?? ""))
    const label = changed.length ? changed.map((key) => FIELD_LABELS[key]).join(", ") : "campos"
    return `Alterou ${label}`
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

// ── Consultas ──────────────────────────────────────────────────────────────

export async function listTasks(includeArchived: boolean): Promise<TaskListDto> {
    await dbConnect()
    const docs = await DevTask.find(includeArchived ? {} : { archived: { $ne: true } }).sort({ columnId: 1, order: 1 }).lean()
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
    return {
        ...withIssue,
        description: task.description ?? null,
        technicalSpec: task.technicalSpec ?? null,
        comments: comments.map((comment) => ({ id: String(comment._id), content: comment.content, createdAt: comment.createdAt ? new Date(comment.createdAt).toISOString() : null })),
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

async function assertColumn(key: string): Promise<void> {
    const board = await getBoard()
    if (!board.columns.some((column) => column.key === key)) throw new DomainError(400, "Coluna inválida", "COLUMN_NOT_FOUND")
}

async function endOrder(columnId: string, exceptId?: string): Promise<number> {
    const last = await DevTask.findOne({ columnId, ...(exceptId ? { _id: { $ne: exceptId } } : {}) })
        .sort({ order: -1 })
        .select({ order: 1 })
        .lean()
    return (last?.order ?? -1) + 1
}

async function nextCode(project: IProject): Promise<string> {
    const updated = await Project.findOneAndUpdate({ _id: (project as unknown as { _id: unknown })._id }, { $inc: { taskSeq: 1 } }, { returnDocument: "after" }).lean()
    const seq = updated?.taskSeq ?? project.taskSeq + 1
    return `${project.sigla}-${seq}`
}

export interface CreateTaskOptions {
    /** Id do usuário para a auditoria (padrão: rotinas usam "system"). */
    actorId: string
    /** Força a ordem (usado por rotinas). Sem isto, vai para o fim da coluna. */
    order?: number
}

export async function createTask(input: CreateTaskInput, options: CreateTaskOptions): Promise<TaskDto> {
    await dbConnect()
    const project = await Project.findById(input.projectId).lean()
    if (!project) throw new DomainError(400, "Projeto inválido", "PROJECT_NOT_FOUND")
    await assertColumn(input.columnId)
    const code = await nextCode(project)
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
    })
    await recordAudit({
        userId: options.actorId,
        entidade: TASK_AUDIT_ENTITY,
        entidadeId: String(task._id),
        acao: AcaoAuditoria.CRIAR,
        depois: { codigo: code, titulo: task.title, projeto: project.name, coluna: input.columnId },
    })
    await publishTasksUpdated([String(task._id)])
    notifyAgenticQueue([String(task._id)])
    return toTaskDto(task.toObject(), project)
}

export async function updateTask(id: string, input: UpdateTaskInput, actorId: string, options: { publish?: boolean } = {}): Promise<void> {
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

    if (Object.keys(set).length === 0) return
    await DevTask.updateOne({ _id: id }, { $set: set })
    await recordAudit({ userId: actorId, entidade: TASK_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: before, depois: after })
    if (options.publish !== false) await publishTasksUpdated([id])
    if (options.publish !== false && columnChanged) notifyAgenticQueue([id])
}

/** Mover a tarefa de coluna (e, opcionalmente, posição). */
export async function moveTask(id: string, input: MoveTaskInput, actorId: string, options: { publish?: boolean } = {}): Promise<TaskDto | null> {
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
        depois: { codigo: task.code, coluna: columnNames.get(input.targetColumn) ?? input.targetColumn, ordem: order },
    })
    if (options.publish !== false) await publishTasksUpdated([id])
    if (options.publish !== false && input.targetColumn !== task.columnId) notifyAgenticQueue([id])
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
    await recordAudit({ userId: actorId, entidade: TASK_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { codigo: task.code, titulo: task.title } })
    await publishTasksUpdated([id])
}

export async function addComment(taskId: string, content: string, actorId: string): Promise<void> {
    assertTaskId(taskId)
    await dbConnect()
    if (!(await DevTask.exists({ _id: taskId }))) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
    await TaskComment.create({ taskId, content: content.trim() })
    await recordAudit({ userId: actorId, entidade: TASK_AUDIT_ENTITY, entidadeId: taskId, acao: AcaoAuditoria.ATUALIZAR, depois: { comentario: "adicionado" } })
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

async function publishTasksUpdated(ids: string[]): Promise<void> {
    if (ids.length) await publishToChannels([appChannel()], TASKS_UPDATED_EVENT, { ids })
}

// ── Uso por rotinas (sync do GitHub) ───────────────────────────────────────

/** Cria a tarefa a partir de uma issue do GitHub (rotina). Devolve o DTO criado. */
export async function createTaskFromIssue(input: { title: string; description: string; projectId: string; columnId: string; taskType: TaskType | null; priority: TaskPriority }): Promise<TaskDto> {
    return createTask({ ...input, taskType: input.taskType, priority: input.priority }, { actorId: "system" })
}
