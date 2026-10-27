import { Schema, model, models, type Model, type Types } from "mongoose"
import { dbConnect } from "@/lib/db"
import type { AdversarialDecision, AdversarialLevel } from "../constants"
import type { AdversarialReviewState } from "../types"
import type { EvaluatedFinding, PreviousStatus } from "../verdict"

/**
 * Coleção do Agente Adversário (os índices são garantidos no primeiro uso, sem migração). Ver
 * `aicontext/modules/adversarial-agent.md`.
 */

/** Uma rodada de revisão de uma mesa — `adversarial_reviews`. */
export interface IAdversarialReview {
    _id: Types.ObjectId
    workbenchId: string
    centralId: string
    taskId: string
    taskCode: string
    taskTitle: string
    cycle: number
    round: number
    level: AdversarialLevel
    state: AdversarialReviewState
    decision: AdversarialDecision | null
    limitReached: boolean
    summary: string | null
    findings: EvaluatedFinding[]
    previous: PreviousStatus[]
    /** Contestações do implementador recebidas nesta rodada (da correção anterior). */
    disputes: { id: string; reason: string }[]
    excluded: string[]
    userText: string | null
    report: string | null
    error: string | null
    sessionId: string | null
    /** Sessão do OpenCode que não pôde ser excluída (tentada de novo na próxima rodada). */
    pendingSessionDeletion: string | null
    usage: { costUsd: number; inputTokens: number; outputTokens: number; reasoningTokens: number }
    startedAt: Date
    finishedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const AdversarialReviewSchema = new Schema<IAdversarialReview>(
    {
        workbenchId: { type: String, required: true },
        centralId: { type: String, required: true },
        taskId: { type: String, required: true },
        taskCode: { type: String, required: true },
        taskTitle: { type: String, default: "" },
        cycle: { type: Number, required: true },
        round: { type: Number, required: true },
        level: { type: String, required: true },
        state: { type: String, required: true },
        decision: { type: String, default: null },
        limitReached: { type: Boolean, default: false },
        summary: { type: String, default: null },
        findings: { type: Schema.Types.Mixed, default: [] },
        previous: { type: Schema.Types.Mixed, default: [] },
        disputes: { type: Schema.Types.Mixed, default: [] },
        excluded: { type: [String], default: [] },
        userText: { type: String, default: null },
        report: { type: String, default: null },
        error: { type: String, default: null },
        sessionId: { type: String, default: null },
        pendingSessionDeletion: { type: String, default: null },
        usage: {
            costUsd: { type: Number, default: 0 },
            inputTokens: { type: Number, default: 0 },
            outputTokens: { type: Number, default: 0 },
            reasoningTokens: { type: Number, default: 0 },
        },
        startedAt: { type: Date, required: true },
        finishedAt: { type: Date, default: null },
    },
    { collection: "adversarial_reviews", versionKey: false, timestamps: true },
)
AdversarialReviewSchema.index({ workbenchId: 1, createdAt: -1 })
AdversarialReviewSchema.index({ createdAt: -1 })

export const AdversarialReview: Model<IAdversarialReview> = (models.AdversarialReview as Model<IAdversarialReview>) || model<IAdversarialReview>("AdversarialReview", AdversarialReviewSchema)

let indexesReady: Promise<void> | null = null

/** Conecta e garante os índices da coleção (uma vez por processo). */
export async function adversarialDb(): Promise<void> {
    await dbConnect()
    indexesReady ??= AdversarialReview.createIndexes()
        .then(() => undefined)
        .catch((error: unknown) => {
            indexesReady = null
            throw error
        })
    await indexesReady
}
