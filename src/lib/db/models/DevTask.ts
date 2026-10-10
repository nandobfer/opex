import { Schema, model, models, type Model } from "mongoose"

/**
 * Tarefas dO Opex — a fonte de verdade. Cada tarefa pertence a um projeto (repositório vinculado)
 * e a uma coluna do quadro (`task_board_columns`). `code` é sequencial por projeto (`{SIGLA}-{n}`).
 * Comentários ficam em `task_comments`; o Histórico é derivado da auditoria (`audit_logs`).
 */

export interface IDevTask {
    code: string
    projectId: string
    columnId: string
    order: number
    title: string
    description: string | null
    technicalSpec: string | null
    taskType: string | null
    priority: string
    archived: boolean
    /** Resumo de 1 linha gerado por IA (substitui a descrição na exibição). */
    summary: string | null
    /** Hash da fonte (título + descrição) do resumo atual; divergente = resumo desatualizado. */
    summarySourceHash: string | null
    summaryUpdatedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const DevTaskSchema = new Schema<IDevTask>(
    {
        code: { type: String, required: true, unique: true },
        projectId: { type: String, required: true, index: true },
        columnId: { type: String, required: true, index: true },
        order: { type: Number, default: 0 },
        title: { type: String, required: true },
        description: { type: String, default: null },
        technicalSpec: { type: String, default: null },
        taskType: { type: String, default: null },
        priority: { type: String, default: "medium" },
        archived: { type: Boolean, default: false },
        summary: { type: String, default: null },
        summarySourceHash: { type: String, default: null },
        summaryUpdatedAt: { type: Date, default: null },
    },
    { collection: "dev_tasks", versionKey: false, timestamps: true },
)

export interface ITaskComment {
    taskId: string
    content: string
    createdAt: Date
}

const TaskCommentSchema = new Schema<ITaskComment>(
    {
        taskId: { type: String, required: true, index: true },
        content: { type: String, required: true },
        createdAt: { type: Date, default: () => new Date() },
    },
    { collection: "task_comments", versionKey: false },
)

if (process.env.NODE_ENV === "development") {
    delete models.DevTask
    delete models.TaskComment
}

export const DevTask: Model<IDevTask> = (models.DevTask as Model<IDevTask>) || model<IDevTask>("DevTask", DevTaskSchema)
export const TaskComment: Model<ITaskComment> =
    (models.TaskComment as Model<ITaskComment>) || model<ITaskComment>("TaskComment", TaskCommentSchema)
