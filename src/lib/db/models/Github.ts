import { Schema, model, models, type Model } from "mongoose"

/**
 * Integração GitHub (Integrações › GitHub):
 * - `github_mappings`: regras Issue Type/label → tipo e label → prioridade (documento `default`);
 * - `github_issue_links`: issue ↔ tarefa dO Opex (criada pela sincronização ou detectada pela
 *   menção), para o botão "Abrir issue" e para não duplicar tarefas.
 *
 * O repositório vinculado é um Projeto (`lib/db/models/Project.ts`).
 */

export interface IGithubTypeRule {
    kind: "type" | "label"
    value: string
    taskType: string
}

export interface IGithubPriorityRule {
    label: string
    priority: string
}

export interface IGithubMapping {
    key: string
    typeRules: IGithubTypeRule[]
    priorityRules: IGithubPriorityRule[]
    updatedAt: Date
}

const GithubMappingSchema = new Schema<IGithubMapping>(
    {
        key: { type: String, required: true, unique: true },
        typeRules: { type: Schema.Types.Mixed, default: [] },
        priorityRules: { type: Schema.Types.Mixed, default: [] },
        updatedAt: { type: Date, default: () => new Date() },
    },
    { collection: "github_mappings", versionKey: false },
)

export interface IGithubIssueLink {
    repo: string
    number: number
    url: string
    taskId: string
    taskCode: string | null
    issueState: "open" | "closed"
    issueStateReason: string | null
    /** Aviso exibido no card (ex.: "Issue fechada"). */
    notice: string | null
    createdAt: Date
    updatedAt: Date
}

const GithubIssueLinkSchema = new Schema<IGithubIssueLink>(
    {
        repo: { type: String, required: true },
        number: { type: Number, required: true },
        url: { type: String, required: true },
        taskId: { type: String, required: true, index: true },
        taskCode: { type: String, default: null },
        issueState: { type: String, default: "open" },
        issueStateReason: { type: String, default: null },
        notice: { type: String, default: null },
    },
    { collection: "github_issue_links", versionKey: false, timestamps: true },
)
GithubIssueLinkSchema.index({ repo: 1, number: 1 }, { unique: true })

if (process.env.NODE_ENV === "development") {
    delete models.GithubMapping
    delete models.GithubIssueLink
}

export const GithubMapping: Model<IGithubMapping> =
    (models.GithubMapping as Model<IGithubMapping>) || model<IGithubMapping>("GithubMapping", GithubMappingSchema)
export const GithubIssueLink: Model<IGithubIssueLink> =
    (models.GithubIssueLink as Model<IGithubIssueLink>) || model<IGithubIssueLink>("GithubIssueLink", GithubIssueLinkSchema)
