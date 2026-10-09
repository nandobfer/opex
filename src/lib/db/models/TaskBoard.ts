import { Schema, model, models, type Model } from "mongoose"

/**
 * Quadro de Tarefas dO Opex (camada local sobre o Go! Sipal):
 * - `task_board_columns`: colunas customizadas (status pessoais), sem efeito no Go! Sipal;
 * - `task_board_layout`: ordem de TODAS as colunas (Go! Sipal fixas entre si + customizadas);
 * - `task_local_states`: tarefa que está numa coluna customizada, com a ordem lá dentro e o status
 *   do Go! Sipal no momento em que entrou (se mudar na plataforma, a tarefa volta).
 */

export interface ITaskBoardColumn {
    key: string
    name: string
    color: string
    icon: string
    description: string | null
    wipLimit: number | null
    createdAt: Date
}

const TaskBoardColumnSchema = new Schema<ITaskBoardColumn>(
    {
        key: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        color: { type: String, required: true },
        icon: { type: String, required: true },
        description: { type: String, default: null },
        wipLimit: { type: Number, default: null },
        createdAt: { type: Date, default: () => new Date() },
    },
    { collection: "task_board_columns", versionKey: false },
)

export interface ITaskBoardLayout {
    key: string
    order: string[]
}

const TaskBoardLayoutSchema = new Schema<ITaskBoardLayout>(
    {
        key: { type: String, required: true, unique: true },
        order: { type: [String], default: [] },
    },
    { collection: "task_board_layout", versionKey: false },
)

export interface ITaskLocalState {
    taskId: string
    code: string | null
    columnKey: string
    order: number
    goStatusAtEntry: string
    updatedAt: Date
}

const TaskLocalStateSchema = new Schema<ITaskLocalState>(
    {
        taskId: { type: String, required: true, unique: true },
        code: { type: String, default: null },
        columnKey: { type: String, required: true, index: true },
        order: { type: Number, default: 0 },
        goStatusAtEntry: { type: String, required: true },
        updatedAt: { type: Date, default: () => new Date() },
    },
    { collection: "task_local_states", versionKey: false },
)

if (process.env.NODE_ENV === "development") {
    delete models.TaskBoardColumn
    delete models.TaskBoardLayout
    delete models.TaskLocalState
}

export const TaskBoardColumn: Model<ITaskBoardColumn> =
    (models.TaskBoardColumn as Model<ITaskBoardColumn>) || model<ITaskBoardColumn>("TaskBoardColumn", TaskBoardColumnSchema)
export const TaskBoardLayout: Model<ITaskBoardLayout> =
    (models.TaskBoardLayout as Model<ITaskBoardLayout>) || model<ITaskBoardLayout>("TaskBoardLayout", TaskBoardLayoutSchema)
export const TaskLocalState: Model<ITaskLocalState> =
    (models.TaskLocalState as Model<ITaskLocalState>) || model<ITaskLocalState>("TaskLocalState", TaskLocalStateSchema)
