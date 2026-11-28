import { Schema, model, models, type Model, type Types } from "mongoose"

/**
 * Bootstrap de projeto (OPE-215):
 * - `project_bootstraps`: um por repositório provisionado (etapa, estado, sessão do OpenCode, pedidos
 *   pendentes, resumo do agente e o que já foi criado). A saída do agente vai para `agentic_events`,
 *   chaveada pelo id do bootstrap, como no refinamento;
 * - `project_bootstrap_tech_groups` e `project_bootstrap_technologies`: o catálogo de tecnologias.
 */

export interface IProjectBootstrap {
    _id: Types.ObjectId
    repo: string
    owner: string
    name: string
    visibility: "private" | "public"
    mode: "new" | "existing"
    branch: string
    directory: string
    context: string
    technologies: { name: string; group: string }[]
    entryColumnKey: string
    closedColumnKey: string | null
    step: string
    status: string
    phase: string | null
    attempt: number
    error: string | null
    missing: string[]
    notice: string | null
    sessionId: string | null
    activeSkills: { sessionId: string; ids: string[] } | null
    pendingForms: unknown[]
    pendingPermissions: unknown[]
    /** Instante em que o turno atual começou (delimita o attach da reconexão). */
    turnStartedAt: Date | null
    reconnect: { outcome: string; message: string | null; at: Date } | null
    /** Ativação dona do trabalho em andamento: as gravações dela filtram por este id. */
    activationId: string | null
    heartbeatAt: Date | null
    /** Início do estado atual (o batimento conta a partir do mais recente dos dois). */
    stateAt: Date | null
    result: { port: number; healthPath: string; hasServer: boolean; usesMongo: boolean; branch: string } | null
    created: { repoUrl: string | null; projectId: string | null; centralId: string | null; environmentId: string | null; deployId: string | null; port: number | null }
    /** A configuração do bootstrap (branch, backup, saúde) já foi aplicada na central. */
    centralConfiguredAt: Date | null
    deploys: { deployId: string; attempt: number; status: string; error: string | null; at: Date }[]
    usage: { costUsd: number; inputTokens: number; outputTokens: number }
    startedAt: Date
    finishedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const EMPTY_CREATED = () => ({ repoUrl: null, projectId: null, centralId: null, environmentId: null, deployId: null, port: null })

const ProjectBootstrapSchema = new Schema<IProjectBootstrap>(
    {
        repo: { type: String, required: true, index: true },
        owner: { type: String, required: true },
        name: { type: String, required: true },
        visibility: { type: String, required: true },
        mode: { type: String, required: true },
        branch: { type: String, required: true },
        directory: { type: String, required: true },
        context: { type: String, default: "" },
        technologies: { type: [new Schema({ name: { type: String, required: true }, group: { type: String, required: true } }, { _id: false })], default: [] },
        entryColumnKey: { type: String, required: true },
        closedColumnKey: { type: String, default: null },
        step: { type: String, required: true, default: "provision" },
        status: { type: String, required: true, default: "running", index: true },
        phase: { type: String, default: null },
        attempt: { type: Number, default: 1 },
        error: { type: String, default: null },
        missing: { type: [String], default: [] },
        notice: { type: String, default: null },
        sessionId: { type: String, default: null },
        activeSkills: { type: Schema.Types.Mixed, default: null },
        pendingForms: { type: [Schema.Types.Mixed], default: [] },
        pendingPermissions: { type: [Schema.Types.Mixed], default: [] },
        turnStartedAt: { type: Date, default: null },
        reconnect: { type: Schema.Types.Mixed, default: null },
        activationId: { type: String, default: null },
        heartbeatAt: { type: Date, default: null },
        stateAt: { type: Date, default: null },
        result: { type: Schema.Types.Mixed, default: null },
        created: { type: Schema.Types.Mixed, default: EMPTY_CREATED },
        centralConfiguredAt: { type: Date, default: null },
        deploys: {
            type: [new Schema({ deployId: { type: String, required: true }, attempt: { type: Number, required: true }, status: { type: String, required: true }, error: { type: String, default: null }, at: { type: Date, required: true } }, { _id: false })],
            default: [],
        },
        usage: { type: Schema.Types.Mixed, default: () => ({ costUsd: 0, inputTokens: 0, outputTokens: 0 }) },
        startedAt: { type: Date, default: () => new Date() },
        finishedAt: { type: Date, default: null },
    },
    { collection: "project_bootstraps", versionKey: false, timestamps: true, minimize: false },
)

export interface IProjectBootstrapTechGroup {
    _id: Types.ObjectId
    name: string
    color: string
    order: number
    createdAt: Date
    updatedAt: Date
}

const TechGroupSchema = new Schema<IProjectBootstrapTechGroup>(
    {
        name: { type: String, required: true, unique: true },
        color: { type: String, required: true },
        order: { type: Number, default: 0 },
    },
    { collection: "project_bootstrap_tech_groups", versionKey: false, timestamps: true },
)

export interface IProjectBootstrapTechnology {
    _id: Types.ObjectId
    name: string
    aliases: string[]
    groupId: string
    createdAt: Date
    updatedAt: Date
}

const TechnologySchema = new Schema<IProjectBootstrapTechnology>(
    {
        name: { type: String, required: true, unique: true },
        aliases: { type: [String], default: [] },
        groupId: { type: String, required: true, index: true },
    },
    { collection: "project_bootstrap_technologies", versionKey: false, timestamps: true },
)

if (process.env.NODE_ENV === "development") {
    delete models.ProjectBootstrap
    delete models.ProjectBootstrapTechGroup
    delete models.ProjectBootstrapTechnology
}

export const ProjectBootstrap: Model<IProjectBootstrap> = (models.ProjectBootstrap as Model<IProjectBootstrap>) || model<IProjectBootstrap>("ProjectBootstrap", ProjectBootstrapSchema)
export const ProjectBootstrapTechGroup: Model<IProjectBootstrapTechGroup> =
    (models.ProjectBootstrapTechGroup as Model<IProjectBootstrapTechGroup>) || model<IProjectBootstrapTechGroup>("ProjectBootstrapTechGroup", TechGroupSchema)
export const ProjectBootstrapTechnology: Model<IProjectBootstrapTechnology> =
    (models.ProjectBootstrapTechnology as Model<IProjectBootstrapTechnology>) || model<IProjectBootstrapTechnology>("ProjectBootstrapTechnology", TechnologySchema)
