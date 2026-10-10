import { Schema, model, models, type Model } from "mongoose"

/**
 * Tarefas dO Opex — a fonte de verdade. Cada tarefa pertence a um projeto (repositório vinculado)
 * e a uma coluna do quadro (`task_board_columns`). `code` é sequencial por projeto (`{SIGLA}-{n}`).
 * Comentários ficam em `task_comments`; o Histórico é derivado da auditoria (`audit_logs`).
 */

/** Estimativa/orçamento da tarefa vinda do portal do cliente (ver `modules/orcamentos.md`). */
export interface ITaskEstimate {
    /** Horas reais estimadas pela IA (visão interna). */
    hours: number
    /** Horas exibidas ao cliente (H × fator de lucro). */
    clientHours: number
    /** Faturamento em reais (clientHours × custo por hora). */
    billingBrl: number
    /** Fator de lucro aplicado (snapshot). */
    factor: number
    /** Custo por hora aplicado (snapshot). */
    hourlyRate: number
    /** Modelo que gerou a estimativa (`provedor/modelo`). */
    model: string | null
    generatedAt: Date
}

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
    /**
     * Cliente de orçamento que **solicitou** a tarefa pelo portal (`OrcamentoClient._id`). `null`
     * quando a tarefa não veio do portal. É o que define a lista do portal (o cliente só vê as que
     * ele pediu — ver `modules/orcamentos.md`).
     */
    clientId: string | null
    /** Resumo de 1 linha gerado por IA (substitui a descrição na exibição). */
    summary: string | null
    /** Hash da fonte (título + descrição) do resumo atual; divergente = resumo desatualizado. */
    summarySourceHash: string | null
    summaryUpdatedAt: Date | null
    /** Tags geradas por IA (ids da taxonomia da feature "Tags de tarefas"). */
    tags: string[]
    /** Hash da fonte (título + descrição) das tags atuais; divergente = tags desatualizadas. */
    tagsSourceHash: string | null
    tagsUpdatedAt: Date | null
    /** Estimativa/orçamento do portal do cliente (`null` quando não veio do portal). */
    estimate: ITaskEstimate | null
    createdAt: Date
    updatedAt: Date
}

const TaskEstimateSchema = new Schema<ITaskEstimate>(
    {
        hours: { type: Number, default: 0 },
        clientHours: { type: Number, default: 0 },
        billingBrl: { type: Number, default: 0 },
        factor: { type: Number, default: 1 },
        hourlyRate: { type: Number, default: 0 },
        model: { type: String, default: null },
        generatedAt: { type: Date, default: () => new Date() },
    },
    { _id: false },
)

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
        clientId: { type: String, default: null, index: true },
        summary: { type: String, default: null },
        summarySourceHash: { type: String, default: null },
        summaryUpdatedAt: { type: Date, default: null },
        tags: { type: [String], default: [], index: true },
        tagsSourceHash: { type: String, default: null },
        tagsUpdatedAt: { type: Date, default: null },
        estimate: { type: TaskEstimateSchema, default: null },
    },
    { collection: "dev_tasks", versionKey: false, timestamps: true },
)

export interface ITaskComment {
    taskId: string
    content: string
    /** Origem do comentário: o dono (app interno) ou o cliente (portal). */
    authorType: "owner" | "client"
    /** Nome exibido do autor (dono: `APP_OWNER_NAME`; cliente: nome do cliente). */
    authorName: string | null
    createdAt: Date
}

const TaskCommentSchema = new Schema<ITaskComment>(
    {
        taskId: { type: String, required: true, index: true },
        content: { type: String, required: true },
        authorType: { type: String, default: "owner" },
        authorName: { type: String, default: null },
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
