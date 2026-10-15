import { Schema, model, models, type Model } from "mongoose"

/**
 * Serviço (`finance_services`): lançamento **manual** de faturamento criado pelo dono em
 * `/financeiro`. Diferente da tarefa — que entra no financeiro pela conclusão derivada da auditoria
 * e pelo snapshot `DevTask.estimate` —, o serviço tem **data própria** (`serviceDate`), cliente
 * obrigatório, repositório e tarefa **opcionais** e três valores reativos (duração real, inflada e
 * faturamento), sempre recalculados no servidor a partir do `factor`/`hourlyRate` **atuais** do
 * cliente (snapshot gravado na criação/edição).
 *
 * A descrição é a fonte do título, do resumo e das tags gerados por IA em segundo plano
 * (`aiStatus`), com os mesmos hashes de fonte das tarefas para saber quando estão desatualizados.
 */

export type ServiceAiStatus = "pending" | "done" | "error"

export interface IFinanceService {
    code: string
    /** Cliente de orçamento (`OrcamentoClient._id`) — obrigatório. */
    clientId: string
    /** Repositório vinculado (`Project._id`) — opcional. */
    projectId: string | null
    /** Tarefa de referência (`DevTask._id`) — opcional; **não** copia descrição nem altera a tarefa. */
    taskId: string | null
    description: string
    /** Título curto gerado por IA (editável manualmente). */
    title: string | null
    /** Resumo de 1 linha gerado por IA (substitui a descrição na exibição quando existir). */
    summary: string | null
    summarySourceHash: string | null
    summaryUpdatedAt: Date | null
    /** Tags geradas por IA (ids da taxonomia da feature "Tags de tarefas"). */
    tags: string[]
    tagsSourceHash: string | null
    tagsUpdatedAt: Date | null
    /** Data do serviço (um dia); governa o período no Financeiro. */
    serviceDate: Date
    /** Duração real (horas decimais). */
    hours: number
    /** Duração inflada (`hours × factor`). */
    clientHours: number
    /** Faturamento em reais (`clientHours × hourlyRate`). */
    billingBrl: number
    /** Snapshot do fator de lucro do cliente na criação/edição. */
    factor: number
    /** Snapshot do custo por hora do cliente na criação/edição. */
    hourlyRate: number
    aiStatus: ServiceAiStatus
    aiError: string | null
    /** Soft delete: some das somas/listas/dashboard/portal, mas preserva registro e anexos. */
    archived: boolean
    createdAt: Date
    updatedAt: Date
}

const FinanceServiceSchema = new Schema<IFinanceService>(
    {
        code: { type: String, required: true, unique: true },
        clientId: { type: String, required: true, index: true },
        projectId: { type: String, default: null, index: true },
        taskId: { type: String, default: null, index: true },
        description: { type: String, required: true },
        title: { type: String, default: null },
        summary: { type: String, default: null },
        summarySourceHash: { type: String, default: null },
        summaryUpdatedAt: { type: Date, default: null },
        tags: { type: [String], default: [], index: true },
        tagsSourceHash: { type: String, default: null },
        tagsUpdatedAt: { type: Date, default: null },
        serviceDate: { type: Date, required: true, index: true },
        hours: { type: Number, default: 0 },
        clientHours: { type: Number, default: 0 },
        billingBrl: { type: Number, default: 0 },
        factor: { type: Number, default: 1 },
        hourlyRate: { type: Number, default: 0 },
        aiStatus: { type: String, default: "pending", index: true },
        aiError: { type: String, default: null },
        archived: { type: Boolean, default: false },
    },
    { collection: "finance_services", versionKey: false, timestamps: true },
)

FinanceServiceSchema.index({ clientId: 1, serviceDate: -1 })

if (process.env.NODE_ENV === "development") {
    delete models.FinanceService
}

export const FinanceService: Model<IFinanceService> =
    (models.FinanceService as Model<IFinanceService>) || model<IFinanceService>("FinanceService", FinanceServiceSchema)
