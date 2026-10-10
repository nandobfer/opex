import { Schema, model, models, type Model } from "mongoose"

/**
 * Quadro de Tarefas dO Opex (colunas 100% configuráveis):
 * - `task_board_columns`: as colunas (nome, cor, ícone, descrição, limite WIP);
 * - `task_board_layout`: documento `board` com a ordem das colunas.
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

if (process.env.NODE_ENV === "development") {
    delete models.TaskBoardColumn
    delete models.TaskBoardLayout
}

export const TaskBoardColumn: Model<ITaskBoardColumn> =
    (models.TaskBoardColumn as Model<ITaskBoardColumn>) || model<ITaskBoardColumn>("TaskBoardColumn", TaskBoardColumnSchema)
export const TaskBoardLayout: Model<ITaskBoardLayout> =
    (models.TaskBoardLayout as Model<ITaskBoardLayout>) || model<ITaskBoardLayout>("TaskBoardLayout", TaskBoardLayoutSchema)
