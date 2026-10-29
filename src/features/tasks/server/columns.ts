import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DevTask } from "@/lib/db/models/DevTask"
import { Project } from "@/lib/db/models/Project"
import { AgenticCentral } from "@/lib/db/models/Agentic"
import { TaskBoardColumn, TaskBoardLayout, type ITaskBoardColumn } from "@/lib/db/models/TaskBoard"
import { appChannel, publishToChannels } from "@/lib/pusher/channels"
import { randomId } from "@/lib/random-id"
import { parseCentralConfig, resolveCentralColumns } from "@/features/agentic/logic"
import { loadAgenticSettings } from "@/features/agentic/server/settings"
import { normalizeLayout, placeColumnAfter, type ColumnColor, type ColumnIcon, type TaskColumnDto, type TaskBoardDto } from "../board"
import { TASK_COLUMNS_UPDATED_EVENT } from "../constants"
import type { ColumnInput, CreateColumnInput } from "../schemas"

/**
 * Colunas do quadro (100% configuráveis) e a ordem delas. Módulo somente servidor.
 */

export const COLUMN_AUDIT_ENTITY = "ColunaTarefas"
const LAYOUT_KEY = "board"

/** Quadro inicial (primeira execução): colunas genéricas, editáveis. */
const DEFAULT_COLUMNS: Pick<ITaskBoardColumn, "key" | "name" | "color" | "icon" | "description" | "wipLimit">[] = [
    { key: "todo", name: "A Fazer", color: "zinc", icon: "inbox", description: null, wipLimit: null },
    { key: "doing", name: "Em Andamento", color: "sky", icon: "clock", description: null, wipLimit: null },
    { key: "done", name: "Concluído", color: "emerald", icon: "check", description: null, wipLimit: null },
]

const toDto = (doc: Pick<ITaskBoardColumn, "key" | "name" | "color" | "icon" | "description" | "wipLimit">): TaskColumnDto => ({
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

/** Garante o quadro padrão na primeira execução (nenhuma coluna criada ainda). */
export async function ensureBoard(): Promise<void> {
    await dbConnect()
    if ((await TaskBoardColumn.countDocuments({})) > 0) return
    await TaskBoardColumn.insertMany(DEFAULT_COLUMNS.map((column) => ({ ...column })))
    await saveLayout(DEFAULT_COLUMNS.map((column) => column.key))
}

export async function getBoard(): Promise<TaskBoardDto> {
    await ensureBoard()
    const [columns, layout] = await Promise.all([TaskBoardColumn.find().sort({ createdAt: 1 }).lean(), TaskBoardLayout.findOne({ key: LAYOUT_KEY }).lean()])
    const dtos = columns.map(toDto)
    return { columns: dtos, layout: normalizeLayout(layout?.order ?? [], dtos.map((column) => column.key)) }
}

/** Primeira coluna do quadro, na ordem do layout (coluna padrão de quem cria sem informar a coluna). */
export async function firstBoardColumnKey(): Promise<string> {
    const board = await getBoard()
    const key = board.layout[0] ?? board.columns[0]?.key
    if (!key) throw new DomainError(409, "O quadro não tem colunas: crie uma coluna antes de criar tarefas", "BOARD_WITHOUT_COLUMNS")
    return key
}

/** Colunas existentes (key → nome). Usado para validar entrada e rotular. */
export async function columnNames(): Promise<Map<string, string>> {
    await dbConnect()
    return new Map((await TaskBoardColumn.find().select({ key: 1, name: 1 }).lean()).map((column) => [column.key, column.name]))
}

const fields = (input: ColumnInput) => ({
    name: input.name,
    color: input.color,
    icon: input.icon,
    description: input.description.trim() || null,
    wipLimit: input.wipLimit ?? null,
})

export async function createColumn(input: CreateColumnInput, actorId: string): Promise<TaskColumnDto> {
    await ensureBoard()
    const key = `col-${randomId().replace(/-/g, "").slice(0, 12)}`
    const doc = await TaskBoardColumn.create({ key, ...fields(input) })
    const board = await getBoard()
    await saveLayout(normalizeLayout(placeColumnAfter(board.layout, key, input.afterKey), board.columns.map((column) => column.key)))
    const dto = toDto(doc)
    await recordAudit({ userId: actorId, entidade: COLUMN_AUDIT_ENTITY, entidadeId: key, acao: AcaoAuditoria.CRIAR, depois: { ...dto } })
    await publishColumnsUpdated()
    return dto
}

export async function updateColumn(key: string, input: ColumnInput, actorId: string): Promise<TaskColumnDto> {
    await dbConnect()
    const before = await TaskBoardColumn.findOne({ key }).lean()
    if (!before) throw new DomainError(404, "Coluna não encontrada", "COLUMN_NOT_FOUND")
    const after = await TaskBoardColumn.findOneAndUpdate({ key }, { $set: fields(input) }, { returnDocument: "after" }).lean()
    const dto = toDto(after ?? before)
    await recordAudit({ userId: actorId, entidade: COLUMN_AUDIT_ENTITY, entidadeId: key, acao: AcaoAuditoria.ATUALIZAR, antes: { ...toDto(before) }, depois: { ...dto } })
    await publishColumnsUpdated()
    return dto
}

/** Só exclui coluna vazia e que não seja coluna de entrada de um projeto. */
export async function deleteColumn(key: string, actorId: string): Promise<void> {
    await dbConnect()
    const column = await TaskBoardColumn.findOne({ key }).lean()
    if (!column) throw new DomainError(404, "Coluna não encontrada", "COLUMN_NOT_FOUND")
    if ((await TaskBoardColumn.countDocuments({})) <= 1) throw new DomainError(409, "O quadro precisa de ao menos uma coluna", "LAST_COLUMN")
    const repos = (await Project.find({ $or: [{ entryColumnKey: key }, { closedColumnKey: key }] }).select({ repo: 1 }).lean()).map((project) => project.repo)
    if (repos.length > 0) {
        throw new DomainError(409, `A coluna é usada por ${repos.join(", ")}: ajuste o vínculo do GitHub antes de excluí-la`, "COLUMN_IN_USE")
    }
    // A coluna pode ser a fila **global** (aba Desenvolvimento agêntico) ou a de uma central que a
    // personaliza ou herda dela (OPE-79).
    const { settings } = await loadAgenticSettings()
    const queueCentrals = (await AgenticCentral.find().select({ projectName: 1, config: 1 }).lean())
        .filter((central) => resolveCentralColumns(settings.columns, parseCentralConfig(central.config).columns).queue === key)
        .map((central) => central.projectName)
    if (settings.columns.queue === key || queueCentrals.length > 0) {
        const parts: string[] = []
        if (settings.columns.queue === key) parts.push("é a fila padrão do desenvolvimento agêntico")
        if (queueCentrals.length > 0) parts.push(`inicia a mesa de ${queueCentrals.join(", ")}`)
        throw new DomainError(409, `A coluna ${parts.join(" e ")}: troque a coluna da fila antes de excluí-la`, "COLUMN_QUEUE_IN_USE")
    }
    const inside = await DevTask.find({ columnId: key }).select({ code: 1 }).limit(5).lean()
    const count = await DevTask.countDocuments({ columnId: key })
    if (count > 0) {
        const codes = inside.map((task) => task.code).filter(Boolean)
        throw new DomainError(
            409,
            `Mova ${count === 1 ? "a tarefa" : `as ${count} tarefas`} desta coluna antes de excluí-la${codes.length ? ` (${codes.join(", ")}${count > codes.length ? "…" : ""})` : ""}`,
            "COLUMN_NOT_EMPTY",
        )
    }
    await TaskBoardColumn.deleteOne({ key })
    const board = await getBoard()
    await saveLayout(board.layout)
    await recordAudit({ userId: actorId, entidade: COLUMN_AUDIT_ENTITY, entidadeId: key, acao: AcaoAuditoria.EXCLUIR, antes: { ...toDto(column) } })
    await publishColumnsUpdated()
}

/** Nova ordem do quadro (precisa conter exatamente as colunas atuais). */
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
