import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { TaskBoardColumn, TaskBoardLayout, TaskLocalState, type ITaskBoardColumn } from "@/lib/db/models/TaskBoard"
import { appChannel, publishToChannels } from "@/lib/pusher/channels"
import { randomId } from "@/lib/random-id"
import { CUSTOM_COLUMN_PREFIX, isCustomColumnKey, normalizeLayout, placeColumnAfter, type ColumnColor, type ColumnIcon, type CustomColumnDto, type TaskBoardDto } from "../board"
import { TASK_COLUMNS_UPDATED_EVENT, TASK_STATUS_LABELS, type TaskStatus } from "../constants"
import type { ColumnInput, CreateColumnInput } from "../schemas"
import type { ReturnedTask, TaskDto } from "../types"

/**
 * Colunas customizadas (status pessoais) e o estado local das tarefas nelas. Nada aqui chama o
 * Go! Sipal. Somente servidor.
 */

export const COLUMN_AUDIT_ENTITY = "ColunaTarefas"
const LAYOUT_KEY = "board"

const toDto = (doc: Pick<ITaskBoardColumn, "key" | "name" | "color" | "icon" | "description" | "wipLimit">): CustomColumnDto => ({
    key: doc.key,
    name: doc.name,
    color: doc.color as ColumnColor,
    icon: doc.icon as ColumnIcon,
    description: doc.description || null,
    wipLimit: doc.wipLimit ?? null,
})

async function publishColumnsUpdated(): Promise<void> {
    await publishToChannels([appChannel()], TASK_COLUMNS_UPDATED_EVENT, {})
}

async function saveLayout(order: string[]): Promise<void> {
    await TaskBoardLayout.updateOne({ key: LAYOUT_KEY }, { $set: { order } }, { upsert: true })
}

export async function getBoard(): Promise<TaskBoardDto> {
    await dbConnect()
    const [columns, layout] = await Promise.all([TaskBoardColumn.find().sort({ createdAt: 1 }).lean(), TaskBoardLayout.findOne({ key: LAYOUT_KEY }).lean()])
    const dtos = columns.map(toDto)
    return { columns: dtos, layout: normalizeLayout(layout?.order ?? [], dtos.map((column) => column.key)) }
}

const fields = (input: ColumnInput) => ({
    name: input.name,
    color: input.color,
    icon: input.icon,
    description: input.description.trim() || null,
    wipLimit: input.wipLimit ?? null,
})

export async function createColumn(input: CreateColumnInput, actorId: string): Promise<CustomColumnDto> {
    await dbConnect()
    const key = `${CUSTOM_COLUMN_PREFIX}${randomId().replace(/-/g, "").slice(0, 12)}`
    const doc = await TaskBoardColumn.create({ key, ...fields(input) })
    const board = await getBoard()
    await saveLayout(normalizeLayout(placeColumnAfter(board.layout, key, input.afterKey), board.columns.map((column) => column.key)))
    const dto = toDto(doc)
    await recordAudit({ userId: actorId, entidade: COLUMN_AUDIT_ENTITY, entidadeId: key, acao: AcaoAuditoria.CRIAR, depois: { ...dto } })
    await publishColumnsUpdated()
    return dto
}

export async function updateColumn(key: string, input: ColumnInput, actorId: string): Promise<CustomColumnDto> {
    await dbConnect()
    const before = await TaskBoardColumn.findOne({ key }).lean()
    if (!before) throw new DomainError(404, "Coluna não encontrada", "COLUMN_NOT_FOUND")
    const after = await TaskBoardColumn.findOneAndUpdate({ key }, { $set: fields(input) }, { returnDocument: "after" }).lean()
    const dto = toDto(after ?? before)
    await recordAudit({ userId: actorId, entidade: COLUMN_AUDIT_ENTITY, entidadeId: key, acao: AcaoAuditoria.ATUALIZAR, antes: { ...toDto(before) }, depois: { ...dto } })
    await publishColumnsUpdated()
    return dto
}

/** Só exclui coluna vazia (409 com os códigos das tarefas que ainda estão nela). */
export async function deleteColumn(key: string, actorId: string): Promise<void> {
    await dbConnect()
    const column = await TaskBoardColumn.findOne({ key }).lean()
    if (!column) throw new DomainError(404, "Coluna não encontrada", "COLUMN_NOT_FOUND")
    const { TaskDraft } = await import("@/lib/db/models/Github")
    const { linksUsingColumn } = await import("@/features/github/server/links")
    const repos = await linksUsingColumn(key)
    if (repos.length > 0) {
        throw new DomainError(409, `A coluna recebe os rascunhos de ${repos.join(", ")}: troque a coluna de entrada em Integrações › GitHub antes de excluí-la`, "COLUMN_IN_USE")
    }
    const drafts = await TaskDraft.find({ columnKey: key, state: { $in: ["draft", "sending"] } }).select({ repo: 1, number: 1 }).lean()
    const inside = [
        ...(await TaskLocalState.find({ columnKey: key }).select({ code: 1 }).lean()),
        ...drafts.map((draft) => ({ code: `${draft.repo.split("/")[1] ?? draft.repo}#${draft.number}` })),
    ]
    if (inside.length > 0) {
        const codes = inside.map((state) => state.code).filter(Boolean).slice(0, 5)
        throw new DomainError(
            409,
            `Mova ${inside.length === 1 ? "a tarefa" : `as ${inside.length} tarefas`} desta coluna antes de excluí-la${codes.length ? ` (${codes.join(", ")}${inside.length > codes.length ? "…" : ""})` : ""}`,
            "COLUMN_NOT_EMPTY",
        )
    }
    await TaskBoardColumn.deleteOne({ key })
    const board = await getBoard()
    await saveLayout(board.layout)
    await recordAudit({ userId: actorId, entidade: COLUMN_AUDIT_ENTITY, entidadeId: key, acao: AcaoAuditoria.EXCLUIR, antes: { ...toDto(column) } })
    await publishColumnsUpdated()
}

/**
 * Nova ordem do quadro. Precisa conter exatamente as colunas atuais; a normalização mantém as do
 * Go! Sipal na ordem do fluxo (só as customizadas mudam de lugar).
 */
export async function reorderColumns(order: string[], actorId: string): Promise<TaskBoardDto> {
    const board = await getBoard()
    const same = order.length === board.layout.length && [...order].sort().join("|") === [...board.layout].sort().join("|")
    if (!same) throw new DomainError(409, "As colunas mudaram enquanto você reorganizava. Recarregue e tente de novo.", "COLUMNS_CHANGED")
    const layout = normalizeLayout(order, board.columns.map((column) => column.key))
    await saveLayout(layout)
    await recordAudit({ userId: actorId, entidade: COLUMN_AUDIT_ENTITY, entidadeId: LAYOUT_KEY, acao: AcaoAuditoria.MOVER, antes: { ordem: board.layout }, depois: { ordem: layout } })
    await publishColumnsUpdated()
    return { ...board, layout }
}

/** Coloca a tarefa numa coluna customizada (sem `order`: no fim dela). Devolve o nome da coluna. */
export async function setLocalColumn(taskId: string, columnKey: string, goStatus: TaskStatus, code: string | null, order?: number): Promise<{ columnName: string; previous: string | null }> {
    if (!isCustomColumnKey(columnKey)) throw new DomainError(400, "Coluna inválida", "COLUMN_NOT_FOUND")
    await dbConnect()
    const column = await TaskBoardColumn.findOne({ key: columnKey }).lean()
    if (!column) throw new DomainError(404, "Coluna não encontrada", "COLUMN_NOT_FOUND")
    let position = order
    if (position === undefined) {
        const last = await TaskLocalState.findOne({ columnKey, taskId: { $ne: taskId } }).sort({ order: -1 }).lean()
        position = (last?.order ?? -1) + 1
    }
    const previous = await TaskLocalState.findOneAndUpdate(
        { taskId },
        { $set: { columnKey, order: position, goStatusAtEntry: goStatus, code, updatedAt: new Date() } },
        { upsert: true, returnDocument: "before" },
    ).lean()
    return { columnName: column.name, previous: previous?.columnKey ?? null }
}

/** Tira a tarefa da coluna customizada (se estiver). Devolve a chave em que estava. */
export async function clearLocalColumn(taskId: string): Promise<string | null> {
    await dbConnect()
    const removed = await TaskLocalState.findOneAndDelete({ taskId }).lean()
    return removed?.columnKey ?? null
}

export async function columnNameOf(key: string | null): Promise<string | null> {
    if (!key) return null
    if (!isCustomColumnKey(key)) return TASK_STATUS_LABELS[key as TaskStatus] ?? key
    const column = await TaskBoardColumn.findOne({ key }).select({ name: 1 }).lean()
    return column?.name ?? null
}

/**
 * Junta o estado local às tarefas lidas do Go! Sipal. Estado vencido (status mudou na plataforma
 * desde que a tarefa entrou na coluna, ou a coluna sumiu) é apagado: a tarefa volta para a coluna
 * do status atual e entra em `returned` (a tela avisa).
 */
export async function applyLocalStates<T extends TaskDto>(tasks: T[]): Promise<{ tasks: T[]; returned: ReturnedTask[] }> {
    if (tasks.length === 0) return { tasks, returned: [] }
    await dbConnect()
    const states = await TaskLocalState.find({ taskId: { $in: tasks.map((task) => task.id) } }).lean()
    if (states.length === 0) return { tasks, returned: [] }
    const columns = new Map((await TaskBoardColumn.find({ key: { $in: [...new Set(states.map((state) => state.columnKey))] } }).select({ key: 1, name: 1 }).lean()).map((column) => [column.key, column.name]))
    const byTask = new Map(states.map((state) => [state.taskId, state]))
    const stale: string[] = []
    const returned: ReturnedTask[] = []
    const result = tasks.map((task) => {
        const state = byTask.get(task.id)
        if (!state) return task
        if (!columns.has(state.columnKey) || state.goStatusAtEntry !== task.status) {
            stale.push(task.id)
            if (columns.has(state.columnKey)) returned.push({ id: task.id, code: task.code, status: task.status, columnName: columns.get(state.columnKey) ?? null })
            return task
        }
        return { ...task, localColumn: state.columnKey, localOrder: state.order }
    })
    if (stale.length) await TaskLocalState.deleteMany({ taskId: { $in: stale } })
    return { tasks: result, returned }
}
