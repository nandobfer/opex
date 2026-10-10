import { Schema, model, models, type Model } from "mongoose"

/**
 * Projeto dO Opex: um repositório GitHub vinculado. É o vínculo do GitHub e a raiz das tarefas —
 * toda tarefa pertence a um projeto (o repositório sincronizado). Guarda também o cursor da
 * sincronização de issues e o contador do código sequencial (`{SIGLA}-{n}`).
 */

export interface IProjectSync {
    at: Date
    ok: boolean
    message: string
}

export interface IProject {
    repo: string
    repoUrl: string
    name: string
    sigla: string
    entryColumnKey: string
    /** Coluna de conclusão ↔ issue fechada. `null` = a coluna não segue o estado da issue. */
    closedColumnKey: string | null
    enabled: boolean
    /** Último número usado no código (`{SIGLA}-{n}`); incrementado a cada tarefa criada. */
    taskSeq: number
    initialImportAt: Date | null
    since: Date | null
    etag: string | null
    lastSync: IProjectSync | null
    createdAt: Date
    updatedAt: Date
}

const ProjectSchema = new Schema<IProject>(
    {
        repo: { type: String, required: true, unique: true },
        repoUrl: { type: String, required: true },
        name: { type: String, required: true },
        sigla: { type: String, required: true },
        entryColumnKey: { type: String, required: true, index: true },
        closedColumnKey: { type: String, default: null },
        enabled: { type: Boolean, default: true },
        taskSeq: { type: Number, default: 0 },
        initialImportAt: { type: Date, default: null },
        since: { type: Date, default: null },
        etag: { type: String, default: null },
        lastSync: { type: Schema.Types.Mixed, default: null },
    },
    { collection: "projects", versionKey: false, timestamps: true },
)

if (process.env.NODE_ENV === "development") {
    delete models.Project
}

export const Project: Model<IProject> = (models.Project as Model<IProject>) || model<IProject>("Project", ProjectSchema)
