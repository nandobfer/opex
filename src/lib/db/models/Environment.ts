import { Schema, model, models, type Model, type Types } from "mongoose"
import { auditPlugin } from "../plugins/audit.plugin"

/**
 * Ambiente (`environments`): um container Compose gerenciado pelo Opex para um repositório. Guarda
 * a branch, o diretório no host, o arquivo/serviço do compose, a porta publicada, os limites, o
 * arquivo `.env` editável, o healthcheck e a fonte do schema do banco.
 *
 * O isolamento é por ambiente (`-p <slug-repo>-<slug-ambiente>`), mas um projeto Compose **já em
 * execução** fora do Opex pode ser **adotado** (`composeProject`), e passa a ser reutilizado em
 * status, logs, publicar e restaurar — sem criar um segundo stack.
 *
 * A compatibilidade imagem × banco usa o **schema registrado no Opex** (`appliedDbVersion`, gravado
 * quando uma subida termina com sucesso) — não há leitura do banco do ambiente.
 */

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
    containers: { name: string; service: string | null; state: string; status: string; image: string | null; health: string | null }[]
    running: boolean
    /** Ao menos um container rodando e ao menos um parado. */
    partial: boolean
    /** O host respondeu à consulta (Docker/SSH/OpenCode disponível). */
    reachable: boolean
    /** Motivo da indisponibilidade do host (`reachable: false`). */
    error: string | null
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
    /** Projeto Compose adotado (existente no host); vazio = derivado do Opex. */
    composeProject: string
    /** Arquivo `.env` do ambiente, relativo ao diretório do repositório. */
    envFile: string
    publishedPort: number | null
    resources: IEnvironmentResources
    healthcheck: IEnvironmentHealthcheck
    dbVersionSource: IDatabaseVersionSource
    /** Schema esperado pela última imagem publicada. `null` = desconhecido. */
    dbVersion: string | null
    /** Schema **registrado** como aplicado ao ambiente (publicação bem-sucedida). */
    appliedDbVersion: string | null
    appliedDbVersionAt: Date | null
    /** Operação que registrou o schema aplicado (rastreabilidade). */
    appliedDbVersionOperationId: string | null
    status: IEnvironmentStatus
    /** Última operação iniciada (para o cabeçalho e a reconexão). */
    lastOperationId: string | null
    createdBy: string
    createdAt: Date
    updatedBy: string
    updatedAt: Date
}

const EnvironmentSchema = new Schema<IEnvironment>(
    {
        projectId: { type: String, required: true, index: true },
        name: { type: String, required: true },
        slug: { type: String, required: true },
        branch: { type: String, default: "main" },
        hostDirectory: { type: String, default: "" },
        composeFile: { type: String, default: "docker-compose.yml" },
        composeService: { type: String, default: "" },
        composeProject: { type: String, default: "" },
        envFile: { type: String, default: ".env" },
        publishedPort: { type: Number, default: null },
        resources: {
            cpus: { type: Number, default: null },
            memoryMb: { type: Number, default: null },
        },
        healthcheck: {
            enabled: { type: Boolean, default: true },
            path: { type: String, default: "/" },
            timeoutMs: { type: Number, default: 60_000 },
        },
        dbVersionSource: {
            kind: { type: String, enum: ["file", "command", "none"], default: "file" },
            value: { type: String, default: "" },
        },
        dbVersion: { type: String, default: null },
        appliedDbVersion: { type: String, default: null },
        appliedDbVersionAt: { type: Date, default: null },
        appliedDbVersionOperationId: { type: String, default: null },
        status: {
            containers: { type: [Schema.Types.Mixed], default: [] },
            running: { type: Boolean, default: false },
            partial: { type: Boolean, default: false },
            reachable: { type: Boolean, default: false },
            error: { type: String, default: null },
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
