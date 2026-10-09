import { Schema, model, models, type Model } from "mongoose"

/**
 * Integração GitHub (Integrações › GitHub):
 * - `github_repo_links`: vínculo repositório ↔ produto do Go! Sipal (um para um), autores
 *   observados, coluna de entrada dos rascunhos e o cursor da sincronização;
 * - `github_mappings`: regras Issue Type/label → tipo e label → prioridade (documento `default`);
 * - `github_people`: login do GitHub → desenvolvedor do Go! Sipal;
 * - `task_drafts`: rascunhos de tarefas criados a partir de issues (únicos por repo + número);
 * - `github_issue_links`: issue ↔ tarefa do Go! Sipal (enviada daqui ou detectada pela menção).
 */

export interface IGithubSyncResult {
    at: Date
    ok: boolean
    message: string
}

export interface IGithubRepoLink {
    repo: string
    repoUrl: string
    productId: string
    productName: string
    authors: string[]
    entryColumnKey: string
    defaultType: string
    defaultPriority: string
    enabled: boolean
    initialImportAt: Date | null
    since: Date | null
    etag: string | null
    lastSync: IGithubSyncResult | null
    createdAt: Date
    updatedAt: Date
}

const GithubRepoLinkSchema = new Schema<IGithubRepoLink>(
    {
        repo: { type: String, required: true, unique: true },
        repoUrl: { type: String, required: true },
        productId: { type: String, required: true, unique: true },
        productName: { type: String, required: true },
        authors: { type: [String], default: [] },
        entryColumnKey: { type: String, required: true, index: true },
        defaultType: { type: String, required: true },
        defaultPriority: { type: String, required: true },
        enabled: { type: Boolean, default: true },
        initialImportAt: { type: Date, default: null },
        since: { type: Date, default: null },
        etag: { type: String, default: null },
        lastSync: { type: Schema.Types.Mixed, default: null },
    },
    { collection: "github_repo_links", versionKey: false, timestamps: true },
)

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

export interface IGithubPerson {
    login: string
    name: string | null
    avatarUrl: string | null
    email: string | null
    developerId: string | null
    developerName: string | null
    suggestion: { developerId: string; developerName: string; reason: string } | null
    repos: string[]
    createdAt: Date
    updatedAt: Date
}

const GithubPersonSchema = new Schema<IGithubPerson>(
    {
        login: { type: String, required: true, unique: true },
        name: { type: String, default: null },
        avatarUrl: { type: String, default: null },
        email: { type: String, default: null },
        developerId: { type: String, default: null },
        developerName: { type: String, default: null },
        suggestion: { type: Schema.Types.Mixed, default: null },
        repos: { type: [String], default: [] },
    },
    { collection: "github_people", versionKey: false, timestamps: true },
)

export type TaskDraftState = "draft" | "sending" | "sent" | "discarded"

export interface ITaskDraft {
    repo: string
    number: number
    issueUrl: string
    author: { login: string; name: string | null; avatarUrl: string | null }
    issueState: "open" | "closed"
    issueStateReason: string | null
    labels: string[]
    issueType: string | null
    milestone: string | null
    assignees: string[]
    issueCreatedAt: Date | null
    issueUpdatedAt: Date | null
    issueTitle: string
    issueBody: string
    title: string
    body: string
    productId: string
    productName: string
    taskType: string
    priority: string
    assigneeId: string | null
    assigneeName: string | null
    assigneeEmail: string | null
    workPackageId: string | null
    workPackageName: string | null
    origins: Record<string, string>
    edited: string[]
    columnKey: string
    order: number
    state: TaskDraftState
    sendingAt: Date | null
    goTaskId: string | null
    goTaskCode: string | null
    sentAt: Date | null
    discardedAt: Date | null
    images: { total: number; attached: number } | null
    createdAt: Date
    updatedAt: Date
}

const TaskDraftSchema = new Schema<ITaskDraft>(
    {
        repo: { type: String, required: true },
        number: { type: Number, required: true },
        issueUrl: { type: String, required: true },
        author: { type: Schema.Types.Mixed, required: true },
        issueState: { type: String, default: "open" },
        issueStateReason: { type: String, default: null },
        labels: { type: [String], default: [] },
        issueType: { type: String, default: null },
        milestone: { type: String, default: null },
        assignees: { type: [String], default: [] },
        issueCreatedAt: { type: Date, default: null },
        issueUpdatedAt: { type: Date, default: null },
        issueTitle: { type: String, default: "" },
        issueBody: { type: String, default: "" },
        title: { type: String, required: true },
        body: { type: String, default: "" },
        productId: { type: String, required: true },
        productName: { type: String, required: true },
        taskType: { type: String, required: true },
        priority: { type: String, required: true },
        assigneeId: { type: String, default: null },
        assigneeName: { type: String, default: null },
        assigneeEmail: { type: String, default: null },
        workPackageId: { type: String, default: null },
        workPackageName: { type: String, default: null },
        origins: { type: Schema.Types.Mixed, default: {} },
        edited: { type: [String], default: [] },
        columnKey: { type: String, required: true, index: true },
        order: { type: Number, default: 0 },
        state: { type: String, default: "draft", index: true },
        sendingAt: { type: Date, default: null },
        goTaskId: { type: String, default: null },
        goTaskCode: { type: String, default: null },
        sentAt: { type: Date, default: null },
        discardedAt: { type: Date, default: null },
        images: { type: Schema.Types.Mixed, default: null },
    },
    { collection: "task_drafts", versionKey: false, timestamps: true, minimize: false },
)
TaskDraftSchema.index({ repo: 1, number: 1 }, { unique: true })

export interface IGithubIssueLink {
    repo: string
    number: number
    url: string
    goTaskId: string
    goTaskCode: string | null
    source: "draft" | "detected"
    issueState: "open" | "closed"
    issueStateReason: string | null
    /** Issue fechada sem commit encontrado: tenta de novo até esta data. */
    pendingCommitUntil: Date | null
    /** Aviso exibido no card (ex.: "aguardando commit"). */
    notice: string | null
    createdAt: Date
    updatedAt: Date
}

const GithubIssueLinkSchema = new Schema<IGithubIssueLink>(
    {
        repo: { type: String, required: true },
        number: { type: Number, required: true },
        url: { type: String, required: true },
        goTaskId: { type: String, required: true, index: true },
        goTaskCode: { type: String, default: null },
        source: { type: String, required: true },
        issueState: { type: String, default: "open" },
        issueStateReason: { type: String, default: null },
        pendingCommitUntil: { type: Date, default: null },
        notice: { type: String, default: null },
    },
    { collection: "github_issue_links", versionKey: false, timestamps: true },
)
GithubIssueLinkSchema.index({ repo: 1, number: 1 }, { unique: true })

if (process.env.NODE_ENV === "development") {
    delete models.GithubRepoLink
    delete models.GithubMapping
    delete models.GithubPerson
    delete models.TaskDraft
    delete models.GithubIssueLink
}

export const GithubRepoLink: Model<IGithubRepoLink> =
    (models.GithubRepoLink as Model<IGithubRepoLink>) || model<IGithubRepoLink>("GithubRepoLink", GithubRepoLinkSchema)
export const GithubMapping: Model<IGithubMapping> =
    (models.GithubMapping as Model<IGithubMapping>) || model<IGithubMapping>("GithubMapping", GithubMappingSchema)
export const GithubPerson: Model<IGithubPerson> =
    (models.GithubPerson as Model<IGithubPerson>) || model<IGithubPerson>("GithubPerson", GithubPersonSchema)
export const TaskDraft: Model<ITaskDraft> = (models.TaskDraft as Model<ITaskDraft>) || model<ITaskDraft>("TaskDraft", TaskDraftSchema)
export const GithubIssueLink: Model<IGithubIssueLink> =
    (models.GithubIssueLink as Model<IGithubIssueLink>) || model<IGithubIssueLink>("GithubIssueLink", GithubIssueLinkSchema)
