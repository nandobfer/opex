import { Schema, model, models, type Model } from "mongoose"

/**
 * Orçamentos dO Opex:
 * - `orcamento_clients`: clientes do portal, cada um com os repositórios permitidos, o custo por
 *   hora, o fator de lucro e o token de acesso (o hash autentica; o valor em claro permite copiar
 *   a URL do portal a qualquer momento);
 * - `orcamento_drafts`: rascunho (descrição + prévia da IA + estimativa de horas) até a aprovação.
 *   `clientId` identifica o **dono** do rascunho: preenchido = pedido pelo cliente no portal;
 *   `null` = prévia aberta pelo próprio dono em `/tarefas/previa` (`estimateClientId` guarda, só no
 *   rascunho do dono, o cliente escolhido para calcular o custo).
 */

/** Agente Maddox de um cliente do portal (`orcamento_clients.maddoxAgent`). */
export interface IOrcamentoClientMaddoxAgent {
    enabled: boolean
    /** Ferramentas do portal desligadas para o Maddox (ferramenta nova entra ligada). */
    disabledTools: string[]
}

export interface IOrcamentoClientOpexAgent {
    enabled: boolean
    /** Nomes das ferramentas desligadas (guardar as desligadas faz ferramenta nova entrar ligada). */
    disabledTools: string[]
    /** Ferramentas "desligadas por padrão" (ex.: Jobs agendados) que o dono ligou para o cliente. */
    enabledOptInTools?: string[]
    /** MCPs do Agente Opex liberados para o cliente (ids de `opex_mcp_servers`; desligado por padrão). */
    enabledMcpServers?: string[]
}

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
    /** Agente Opex no portal: ativação (padrão ligado) e ferramentas **desligadas** pelo dono. */
    opexAgent?: IOrcamentoClientOpexAgent
    /** Agente Maddox no portal: **desligado** por padrão; ferramentas desligadas pelo dono. */
    maddoxAgent?: IOrcamentoClientMaddoxAgent
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
        opexAgent: {
            enabled: { type: Boolean, default: true },
            disabledTools: { type: [String], default: [] },
            enabledOptInTools: { type: [String], default: [] },
            enabledMcpServers: { type: [String], default: [] },
        },
        // Mixed sem padrão: cliente novo nasce sem o Maddox (a normalização lê ausente = desligado).
        maddoxAgent: { type: Schema.Types.Mixed, default: undefined },
    },
    { collection: "orcamento_clients", versionKey: false, timestamps: true },
)

export interface IOrcamentoDraftPreview {
    title: string
    taskType: string | null
    priority: string
    technicalSpec: string
    summary: string
    /** Tags (ids da taxonomia) geradas pela feature "Tags de tarefas" para este rascunho. */
    tags: string[]
}

export interface IOrcamentoDraft {
    /**
     * Cliente que pediu a tarefa (portal). `null` = rascunho aberto pelo **dono** (`/tarefas/previa`).
     * Sem um campo `origin`: todo rascunho legado tem `clientId`, então `null` identifica o dono sem
     * ambiguidade e as consultas do portal (`{ clientId }`) não alcançam os rascunhos do dono.
     */
    clientId: string | null
    /**
     * Cliente escolhido **pelo dono** para o cálculo de custo da estimativa (opcional; o portal não
     * usa e mantém `null`, pois o custo vem do próprio `clientId`).
     */
    estimateClientId: string | null
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
        tags: { type: [String], default: [] },
    },
    { _id: false },
)

const OrcamentoDraftSchema = new Schema<IOrcamentoDraft>(
    {
        clientId: { type: String, default: null, index: true },
        estimateClientId: { type: String, default: null },
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
