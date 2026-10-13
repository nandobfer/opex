import { Schema, model, models, type Model, type Types } from "mongoose"
import { auditPlugin } from "../plugins/audit.plugin"

/**
 * Operação durável de um ambiente (`environment_operations`): publicar ou restaurar. Persistida
 * **antes** da execução, com etapas, estado, tentativa e lease, para sobreviver a fechar a tela e a
 * reinícios do app (reconciliação pelo agendador interno). Uma operação ativa por ambiente por vez.
 */

export type EnvironmentOperationType = "publish" | "restore"
export type EnvironmentOperationStatus = "queued" | "running" | "done" | "failed" | "cancelled"
export type EnvironmentOperationStepStatus = "pending" | "running" | "done" | "failed" | "skipped"

export interface IEnvironmentOperationStep {
    id: string
    label: string
    status: EnvironmentOperationStepStatus
    message: string | null
    startedAt: Date | null
    finishedAt: Date | null
}

export interface IEnvironmentOperation {
    _id: Types.ObjectId
    environmentId: string
    projectId: string
    type: EnvironmentOperationType
    /** `local` (Opex) ou `cd` (GitHub Actions). `null` até ser decidido. */
    method: "local" | "cd" | null
    status: EnvironmentOperationStatus
    /** Número da tentativa (idempotência: uma tentativa antiga não promove). */
    attempt: number
    steps: IEnvironmentOperationStep[]
    message: string | null
    /** Snapshot da configuração usada (branch, compose, porta, imagem...); nunca segredos. */
    configSnapshot: Record<string, unknown>
    /** SHA do commit publicado (quando aplicável). */
    commitSha: string | null
    /** Imagem alvo (restauração) ou publicada (build). */
    imageId: string | null
    /** Run do GitHub (CD). */
    runId: string | null
    runUrl: string | null
    /** Lease da execução viva: identifica o dono no processo e evita concorrência. */
    lease: { owner: string; expiresAt: Date } | null
    startedAt: Date | null
    finishedAt: Date | null
    createdBy: string
    createdAt: Date
    updatedBy: string
    updatedAt: Date
}

const EnvironmentOperationStepSchema = new Schema<IEnvironmentOperationStep>(
    {
        id: { type: String, required: true },
        label: { type: String, required: true },
        status: { type: String, default: "pending" },
        message: { type: String, default: null },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null },
    },
    { _id: false },
)

const EnvironmentOperationSchema = new Schema<IEnvironmentOperation>(
    {
        environmentId: { type: String, required: true, index: true },
        projectId: { type: String, required: true },
        type: { type: String, enum: ["publish", "restore"], required: true },
        method: { type: String, enum: ["local", "cd"], default: null },
        status: { type: String, enum: ["queued", "running", "done", "failed", "cancelled"], default: "queued", index: true },
        attempt: { type: Number, default: 1 },
        steps: { type: [EnvironmentOperationStepSchema], default: [] },
        message: { type: String, default: null },
        configSnapshot: { type: Schema.Types.Mixed, default: {} },
        commitSha: { type: String, default: null },
        imageId: { type: String, default: null },
        runId: { type: String, default: null },
        runUrl: { type: String, default: null },
        lease: { type: Schema.Types.Mixed, default: null },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null },
    },
    { collection: "environment_operations", versionKey: false },
)

EnvironmentOperationSchema.index({ environmentId: 1, status: 1 })

EnvironmentOperationSchema.plugin(auditPlugin)

if (process.env.NODE_ENV === "development") {
    delete models.EnvironmentOperation
}

export const EnvironmentOperation: Model<IEnvironmentOperation> =
    (models.EnvironmentOperation as Model<IEnvironmentOperation>) ||
    model<IEnvironmentOperation>("EnvironmentOperation", EnvironmentOperationSchema)
