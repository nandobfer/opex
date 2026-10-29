import { Schema, model, models, type Model, type Types } from "mongoose"
import { dbConnect } from "@/lib/db"
import type { EncryptedSecret } from "@/lib/crypto/secretBox"
import { DEPLOY_TTL_SECONDS } from "../constants"
import type { EnvironmentSource, Machine } from "../schemas"
import type { DeployKind, DeployStatus } from "../types"

/** Coleções do módulo Ambientes (índices garantidos no primeiro uso). Ver `aicontext/modules/environments.md`. */

export interface IEnvironment {
    _id: Types.ObjectId
    name: string
    slug: string
    source: EnvironmentSource
    /** Variáveis extras com o valor cifrado (`secretBox`). */
    env: { key: string; value: EncryptedSecret }[]
    ports: number[]
    healthUrl: string | null
    buildOn: Machine
    runOn: Machine
    deployedOn: { buildOn: Machine; runOn: Machine } | null
    deployedRef: string | null
    deployedCommit: string | null
    /** Versão do `package.json` do código do último deploy com sucesso. */
    deployedVersion?: string | null
    lastDeployId: string | null
    createdAt: Date
    updatedAt: Date
}

export interface IEnvironmentDeploy {
    _id: Types.ObjectId
    environmentId: string
    kind: DeployKind
    status: DeployStatus
    ref: string | null
    commit: string | null
    /** Tag das imagens no registry (build e execução em máquinas diferentes). */
    imageTag: string | null
    /** Repositórios do registry que o deploy publicou (`opex-env/<slug>-<serviço>`), para a limpeza. */
    repositories?: string[]
    buildOn: Machine
    runOn: Machine
    log: string
    error: string | null
    startedAt: Date
    finishedAt: Date | null
    /** Versão do `package.json` do código implantado. */
    version?: string | null
    /** Build pulado: as imagens do commit já existiam na máquina do build. */
    skipBuild?: boolean
    /** Retomado por outro processo depois de o app reiniciar no meio. */
    resumed?: boolean
    /** Sinal de vida do processo que conduz o deploy (vencido = processo morreu). */
    heartbeatAt?: Date | null
    runnerId?: string | null
    /** Ponto de retomada da fase de execução (`null` antes dela e depois do fim). */
    checkpoint?: DeployCheckpoint | null
    /** Sessão do Agente Opex que pediu o deploy: recebe um aviso quando ele termina. */
    notifyOpexSessionId?: string | null
}

/** O suficiente para remontar os passos da fase de execução (`executionSteps`) e terminar o deploy. */
export interface DeployCheckpoint {
    /** Índice do passo em andamento. */
    step: number
    /** Mensagem da primeira falha (só os passos `always` continuam). */
    failure: string | null
    ref: string | null
    commit: string | null
    tag: string
    version: string | null
    buildServices: string[]
    skipBuild: boolean
    from: Machine | null
}

export interface IEnvironmentsState {
    key: "default"
    settings: Record<string, unknown> | null
    updatedAt: Date | null
}

const environmentSchema = new Schema<IEnvironment>(
    {
        name: { type: String, required: true },
        slug: { type: String, required: true, unique: true },
        source: { type: Schema.Types.Mixed, required: true },
        env: { type: Schema.Types.Mixed, default: () => [] },
        ports: { type: [Number], default: [] },
        healthUrl: { type: String, default: null },
        buildOn: { type: String, required: true },
        runOn: { type: String, required: true },
        deployedOn: { type: Schema.Types.Mixed, default: null },
        deployedRef: { type: String, default: null },
        deployedCommit: { type: String, default: null },
        deployedVersion: { type: String, default: null },
        lastDeployId: { type: String, default: null },
        createdAt: { type: Date, default: () => new Date() },
        updatedAt: { type: Date, default: () => new Date() },
    },
    { collection: "environments", versionKey: false },
)

const deploySchema = new Schema<IEnvironmentDeploy>(
    {
        environmentId: { type: String, required: true, index: true },
        kind: { type: String, required: true },
        status: { type: String, required: true },
        ref: { type: String, default: null },
        commit: { type: String, default: null },
        imageTag: { type: String, default: null },
        repositories: { type: [String], default: undefined },
        buildOn: { type: String, required: true },
        runOn: { type: String, required: true },
        log: { type: String, default: "" },
        error: { type: String, default: null },
        startedAt: { type: Date, required: true, default: () => new Date() },
        finishedAt: { type: Date, default: null },
        version: { type: String, default: null },
        skipBuild: { type: Boolean, default: false },
        resumed: { type: Boolean, default: false },
        heartbeatAt: { type: Date, default: null },
        runnerId: { type: String, default: null },
        checkpoint: { type: Schema.Types.Mixed, default: null },
        notifyOpexSessionId: { type: String, default: null },
    },
    { collection: "environment_deploys", versionKey: false },
)
deploySchema.index({ startedAt: 1 }, { expireAfterSeconds: DEPLOY_TTL_SECONDS })
deploySchema.index({ status: 1, heartbeatAt: 1 })

const stateSchema = new Schema<IEnvironmentsState>(
    {
        key: { type: String, required: true, unique: true, default: "default" },
        settings: { type: Schema.Types.Mixed, default: null },
        updatedAt: { type: Date, default: null },
    },
    { collection: "environments_state", versionKey: false },
)

export const Environment: Model<IEnvironment> = (models.Environment as Model<IEnvironment>) ?? model<IEnvironment>("Environment", environmentSchema)
export const EnvironmentDeploy: Model<IEnvironmentDeploy> = (models.EnvironmentDeploy as Model<IEnvironmentDeploy>) ?? model<IEnvironmentDeploy>("EnvironmentDeploy", deploySchema)
export const EnvironmentsState: Model<IEnvironmentsState> = (models.EnvironmentsState as Model<IEnvironmentsState>) ?? model<IEnvironmentsState>("EnvironmentsState", stateSchema)

let indexesReady: Promise<void> | null = null

export async function environmentsDb(): Promise<void> {
    await dbConnect()
    indexesReady ??= Promise.all([Environment.createIndexes(), EnvironmentDeploy.createIndexes(), EnvironmentsState.createIndexes()])
        .then(() => undefined)
        .catch((error: unknown) => {
            indexesReady = null
            throw error
        })
    await indexesReady
}
