import { Schema, model, models, type Model } from "mongoose"

/**
 * Orçamentos dO Opex:
 * - `orcamento_clients`: clientes do portal, cada um com os repositórios permitidos, o custo por
 *   hora, o fator de lucro e o token de acesso (o hash autentica; o valor em claro permite copiar
 *   a URL do portal a qualquer momento);
 * - `orcamento_drafts`: rascunho criado pelo portal (descrição + prévia da IA + estimativa de horas) até a aprovação.
 */

export interface IOrcamentoClient {
    name: string
    /** Valor do token de acesso ao portal (`cli_…`), para montar a URL copiável no painel. */
    token: string
    /** SHA-256 do token de acesso ao portal (usado na autenticação). */
    tokenHash: string
    /** Prefixo visível do token (ex.: `cli_ab12cd34`). */
    tokenPrefix: string
    /** Projetos (repositórios vinculados) que o cliente pode ver e escolher. */
    projectIds: string[]
    /** Custo por hora em reais. */
    hourlyRate: number
    /** Multiplicador de lucro aplicado às horas exibidas ao cliente. */
    profitFactor: number
    active: boolean
    createdAt: Date
    updatedAt: Date
}

const OrcamentoClientSchema = new Schema<IOrcamentoClient>(
    {
        name: { type: String, required: true },
        token: { type: String, required: true },
        tokenHash: { type: String, required: true, index: true },
        tokenPrefix: { type: String, required: true },
        projectIds: { type: [String], default: [] },
        hourlyRate: { type: Number, default: 0 },
        profitFactor: { type: Number, default: 1 },
        active: { type: Boolean, default: true },
    },
    { collection: "orcamento_clients", versionKey: false, timestamps: true },
)

export interface IOrcamentoDraftPreview {
    title: string
    taskType: string | null
    priority: string
    technicalSpec: string
    summary: string
}

export interface IOrcamentoDraft {
    clientId: string
    projectId: string
    description: string
    /** Texto de correção pedido pelo cliente (vai junto do próximo prompt). */
    correction: string | null
    preview: IOrcamentoDraftPreview | null
    /** Horas estimadas reais (H), antes do fator de lucro. `null` enquanto a estimativa não roda. */
    estimatedHours: number | null
    /** Modelo que gerou a prévia (`provedor/modelo`). */
    model: string | null
    status: "draft" | "approved"
    /** Tarefa criada na aprovação. */
    taskId: string | null
    createdAt: Date
    updatedAt: Date
}

const OrcamentoDraftPreviewSchema = new Schema<IOrcamentoDraftPreview>(
    {
        title: { type: String, required: true },
        taskType: { type: String, default: null },
        priority: { type: String, default: "medium" },
        technicalSpec: { type: String, default: "" },
        summary: { type: String, default: "" },
    },
    { _id: false },
)

const OrcamentoDraftSchema = new Schema<IOrcamentoDraft>(
    {
        clientId: { type: String, required: true, index: true },
        projectId: { type: String, required: true },
        description: { type: String, required: true },
        correction: { type: String, default: null },
        preview: { type: OrcamentoDraftPreviewSchema, default: null },
        estimatedHours: { type: Number, default: null },
        model: { type: String, default: null },
        status: { type: String, default: "draft", index: true },
        taskId: { type: String, default: null },
    },
    { collection: "orcamento_drafts", versionKey: false, timestamps: true },
)

if (process.env.NODE_ENV === "development") {
    delete models.OrcamentoClient
    delete models.OrcamentoDraft
}

export const OrcamentoClient: Model<IOrcamentoClient> =
    (models.OrcamentoClient as Model<IOrcamentoClient>) || model<IOrcamentoClient>("OrcamentoClient", OrcamentoClientSchema)
export const OrcamentoDraft: Model<IOrcamentoDraft> =
    (models.OrcamentoDraft as Model<IOrcamentoDraft>) || model<IOrcamentoDraft>("OrcamentoDraft", OrcamentoDraftSchema)
