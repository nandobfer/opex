import { Schema, model, models, type Model, type Types } from "mongoose"
import { auditPlugin } from "../plugins/audit.plugin"
import type { EncryptedSecret } from "@/lib/crypto/secretBox"

/**
 * Ambiente (`environments`): um container Compose gerenciado pelo Opex para um repositório. Guarda
 * a branch, o diretório no host, o arquivo/serviço do compose, a porta publicada, os limites, as
 * variáveis, o healthcheck e a fonte da versão de banco. O isolate é por ambiente
 * (`-p <slug-repo>-<slug-ambiente>`), então dois ambientes podem conviver no mesmo host.
 */

export interface IEnvironmentEnvVar {
    key: string
    value: string
    secret: boolean
}

export interface IEnvironmentResources {
    cpus: number | null
    memoryMb: number | null
}

export interface IEnvironmentHealthcheck {
    enabled: boolean
    path: string
    timeoutMs: number
}

export interface IDatabaseVersionSource {
    kind: "file" | "command" | "none"
    value: string
}

export interface IEnvironmentStatus {
    containers: { name: string; service: string | null; state: string; status: string; image: string | null }[]
    running: boolean
    checkedAt: Date | null
}

export interface IEnvironment {
    _id: Types.ObjectId
    projectId: string
    name: string
    slug: string
    branch: string
    hostDirectory: string
    composeFile: string
    composeService: string
    publishedPort: number | null
    resources: IEnvironmentResources
    envVars: IEnvironmentEnvVar[]
    healthcheck: IEnvironmentHealthcheck
    dbVersionSource: IDatabaseVersionSource
    /** Override cifrado da connection string (vazio = usa a do repositório). */
    connectionString: EncryptedSecret | null
    /** Última versão de banco conhecida. `null` = desconhecida. */
    dbVersion: string | null
    status: IEnvironmentStatus
    /** Última operação iniciada (para o cabeçalho e a reconexão). */
    lastOperationId: string | null
    createdBy: string
    createdAt: Date
    updatedBy: string
    updatedAt: Date
}

const EnvironmentEnvVarSchema = new Schema<IEnvironmentEnvVar>(
    {
        key: { type: String, required: true },
        value: { type: String, default: "" },
        secret: { type: Boolean, default: false },
    },
    { _id: false },
)

const EnvironmentSchema = new Schema<IEnvironment>(
    {
        projectId: { type: String, required: true, index: true },
        name: { type: String, required: true },
        slug: { type: String, required: true },
        branch: { type: String, default: "main" },
        hostDirectory: { type: String, default: "" },
        composeFile: { type: String, default: "docker-compose.yml" },
        composeService: { type: String, default: "" },
        publishedPort: { type: Number, default: null },
        resources: {
            cpus: { type: Number, default: null },
            memoryMb: { type: Number, default: null },
        },
        envVars: { type: [EnvironmentEnvVarSchema], default: [] },
        healthcheck: {
            enabled: { type: Boolean, default: true },
            path: { type: String, default: "/" },
            timeoutMs: { type: Number, default: 60_000 },
        },
        dbVersionSource: {
            kind: { type: String, enum: ["file", "command", "none"], default: "file" },
            value: { type: String, default: "" },
        },
        connectionString: { type: Schema.Types.Mixed, default: null },
        dbVersion: { type: String, default: null },
        status: {
            containers: { type: [Schema.Types.Mixed], default: [] },
            running: { type: Boolean, default: false },
            checkedAt: { type: Date, default: null },
        },
        lastOperationId: { type: String, default: null },
    },
    { collection: "environments", versionKey: false },
)

EnvironmentSchema.index({ projectId: 1, slug: 1 }, { unique: true })

EnvironmentSchema.plugin(auditPlugin)

if (process.env.NODE_ENV === "development") {
    delete models.Environment
}

export const Environment: Model<IEnvironment> = (models.Environment as Model<IEnvironment>) || model<IEnvironment>("Environment", EnvironmentSchema)
