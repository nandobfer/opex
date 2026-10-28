import { Schema, model, models, type Model } from "mongoose"
import { dbConnect } from "@/lib/db"
import type { LocalDockerOverrideMode } from "../schemas"

/**
 * Coleções da Builder Machine (índices garantidos no primeiro uso, sem migração nativa). Ver `aicontext/modules/builder-machine.md`.
 */

export interface ILocalDockerStep {
    label: string
    ok: boolean
    detail: string
}

/** Documento único (`key: "default"`): configuração, chave pública e estado desejado do túnel. */
export interface ILocalDockerState {
    key: "default"
    settings: Record<string, unknown> | null
    /** Parte pública (vai no script do WSL); a tela mostra só a impressão digital. */
    publicKey: string | null
    /** `generated` = criada no host pelo app; `imported` = colada (privada cifrada na integração). */
    keySource: "generated" | "imported" | null
    keyFingerprint: string | null
    /** Limites com que o builder dedicado foi criado (mudou = recriar mantendo o cache). */
    builderApplied: { memoryGb: number | null; cpus: number | null } | null
    /** Último preparo (manual ou automático ao salvar), passo a passo. */
    lastPrepare: { ok: boolean; trigger: "manual" | "save"; steps: ILocalDockerStep[]; at: Date } | null
    /** O usuário abriu o túnel (a rotina tenta reabrir se ele cair); fechar zera. */
    wantOpen: boolean
    /** Último estado visto pela rotina (para publicar só quando muda). */
    lastSeenOpen: boolean | null
    lastCheckAt: Date | null
    updatedAt: Date | null
    updatedBy: string | null
}

export interface ILocalDockerOverride {
    centralId: string
    mode: LocalDockerOverrideMode
    updatedAt: Date
}

export interface ILocalDockerPreview {
    workbenchId: string
    centralId: string
    composeProject: string
    port: number
    pendingTeardown: boolean
    /** Arquivos do compose usados no build (base + override das CAs do PC); vazio = padrão do compose. */
    composeFiles?: string[]
    createdAt: Date
}

const stateSchema = new Schema<ILocalDockerState>(
    {
        key: { type: String, required: true, unique: true },
        settings: { type: Schema.Types.Mixed, default: null },
        publicKey: { type: String, default: null },
        keySource: { type: String, default: null },
        keyFingerprint: { type: String, default: null },
        builderApplied: { type: Schema.Types.Mixed, default: null },
        lastPrepare: { type: Schema.Types.Mixed, default: null },
        wantOpen: { type: Boolean, default: false },
        lastSeenOpen: { type: Boolean, default: null },
        lastCheckAt: { type: Date, default: null },
        updatedAt: { type: Date, default: null },
        updatedBy: { type: String, default: null },
    },
    { collection: "local_docker_state", versionKey: false },
)

const overrideSchema = new Schema<ILocalDockerOverride>(
    {
        centralId: { type: String, required: true, unique: true },
        mode: { type: String, required: true },
        updatedAt: { type: Date, default: () => new Date() },
    },
    { collection: "local_docker_central_overrides", versionKey: false },
)

const previewSchema = new Schema<ILocalDockerPreview>(
    {
        workbenchId: { type: String, required: true, unique: true },
        centralId: { type: String, required: true },
        composeProject: { type: String, required: true },
        port: { type: Number, required: true },
        pendingTeardown: { type: Boolean, default: false },
        composeFiles: { type: [String], default: [] },
        createdAt: { type: Date, default: () => new Date() },
    },
    { collection: "local_docker_previews", versionKey: false },
)

export const LocalDockerState: Model<ILocalDockerState> = (models.LocalDockerState as Model<ILocalDockerState>) ?? model<ILocalDockerState>("LocalDockerState", stateSchema)
export const LocalDockerOverride: Model<ILocalDockerOverride> = (models.LocalDockerOverride as Model<ILocalDockerOverride>) ?? model<ILocalDockerOverride>("LocalDockerOverride", overrideSchema)
export const LocalDockerPreview: Model<ILocalDockerPreview> = (models.LocalDockerPreview as Model<ILocalDockerPreview>) ?? model<ILocalDockerPreview>("LocalDockerPreview", previewSchema)

let indexesReady: Promise<void> | null = null

/** Conecta e garante os índices das coleções da Builder Machine (uma vez por processo). */
export async function localDockerDb(): Promise<void> {
    await dbConnect()
    indexesReady ??= Promise.all([LocalDockerState.createIndexes(), LocalDockerOverride.createIndexes(), LocalDockerPreview.createIndexes()])
        .then(() => undefined)
        .catch((error: unknown) => {
            indexesReady = null
            throw error
        })
    await indexesReady
}
