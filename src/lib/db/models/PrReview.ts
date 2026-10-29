import { Schema, model, models, type Model, type Types } from "mongoose"

/**
 * Agente Revisor (configuração em Integrações › Provedores de IA › Agente Revisor; lista em `/agente-revisor`): uma revisão por PR e commit (head
 * SHA). A saída do agente vai para `agentic_events`, chaveada pelo id da revisão.
 */

export interface IPrReview {
    _id: Types.ObjectId
    repo: string
    number: number
    url: string
    title: string
    author: string | null
    baseRef: string
    headSha: string
    draft: boolean
    centralId: string
    projectName: string
    /** Mesa de trabalho dona do PR (quando aberto pelo desenvolvimento agêntico). */
    workbenchId: string | null
    /** `auto` = rotina; `manual` = "Revisar PR" / "Revisar de novo". */
    trigger: string
    /** `queued` → `running` → `done` | `failed` | `interrupted`. */
    state: string
    verdict: string | null
    blocking: number | null
    summary: string | null
    report: string | null
    error: string | null
    sessionId: string | null
    pendingSessionDeletions: string[]
    usage: { costUsd: number; inputTokens: number; outputTokens: number; reasoningTokens: number }
    heartbeatAt: Date | null
    startedAt: Date | null
    finishedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const PrReviewSchema = new Schema<IPrReview>(
    {
        repo: { type: String, required: true },
        number: { type: Number, required: true },
        url: { type: String, required: true },
        title: { type: String, default: "" },
        author: { type: String, default: null },
        baseRef: { type: String, default: "" },
        headSha: { type: String, required: true },
        draft: { type: Boolean, default: false },
        centralId: { type: String, required: true },
        projectName: { type: String, default: "" },
        workbenchId: { type: String, default: null },
        trigger: { type: String, default: "auto" },
        state: { type: String, required: true, default: "queued", index: true },
        verdict: { type: String, default: null },
        blocking: { type: Number, default: null },
        summary: { type: String, default: null },
        report: { type: String, default: null },
        error: { type: String, default: null },
        sessionId: { type: String, default: null },
        pendingSessionDeletions: { type: [String], default: [] },
        usage: { type: Schema.Types.Mixed, default: () => ({ costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 }) },
        heartbeatAt: { type: Date, default: null },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null },
    },
    { collection: "pr_reviews", versionKey: false, timestamps: true, minimize: false },
)

PrReviewSchema.index({ repo: 1, number: 1, headSha: 1 }, { unique: true })
PrReviewSchema.index({ createdAt: -1 })

if (process.env.NODE_ENV === "development") {
    delete models.PrReview
}

export const PrReview: Model<IPrReview> = (models.PrReview as Model<IPrReview>) || model<IPrReview>("PrReview", PrReviewSchema)
