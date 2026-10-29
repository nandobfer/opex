import { Schema, model, models, type Model, type Types } from "mongoose"
import { dbConnect } from "@/lib/db"
import type { MentorLevel, MentorRunStatus, MentorSource, MentorUserTrigger } from "../../mentor/constants"

/** Uma execução do Agente Mentor — `adversarial_mentor_runs` (índices garantidos no primeiro uso). */
export interface IMentorRun {
    _id: Types.ObjectId
    workbenchId: string
    centralId: string
    taskId: string
    taskCode: string
    taskTitle: string
    sources: MentorSource[]
    trigger: MentorUserTrigger | null
    /** Início da mensagem do usuário (para a lista; nunca vira texto de memória). */
    userMessage: string | null
    lessonCount: number
    status: MentorRunStatus
    level: MentorLevel
    score: number | null
    threshold: number
    deciderReason: string | null
    writerAction: "create" | "update" | "skip" | null
    writerReason: string | null
    sanitizerReason: string | null
    /** Proposta do redator (no modo Sugerir, aguarda Aprovar/Descartar). */
    proposal: { action: "create" | "update"; memoryId: string | null; text: string } | null
    memoryId: string | null
    error: string | null
    costUsd: number
    durationMs: number | null
    startedAt: Date | null
    finishedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const MentorRunSchema = new Schema<IMentorRun>(
    {
        workbenchId: { type: String, required: true },
        centralId: { type: String, required: true },
        taskId: { type: String, required: true },
        taskCode: { type: String, required: true },
        taskTitle: { type: String, default: "" },
        sources: { type: [String], default: [] },
        trigger: { type: String, default: null },
        userMessage: { type: String, default: null },
        lessonCount: { type: Number, default: 0 },
        status: { type: String, required: true },
        level: { type: String, required: true },
        score: { type: Number, default: null },
        threshold: { type: Number, required: true },
        deciderReason: { type: String, default: null },
        writerAction: { type: String, default: null },
        writerReason: { type: String, default: null },
        sanitizerReason: { type: String, default: null },
        proposal: { type: Schema.Types.Mixed, default: null },
        memoryId: { type: String, default: null },
        error: { type: String, default: null },
        costUsd: { type: Number, default: 0 },
        durationMs: { type: Number, default: null },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null },
    },
    { collection: "adversarial_mentor_runs", versionKey: false, timestamps: true },
)
MentorRunSchema.index({ createdAt: -1 })
MentorRunSchema.index({ status: 1, createdAt: -1 })

export const MentorRun: Model<IMentorRun> = (models.AdversarialMentorRun as Model<IMentorRun>) || model<IMentorRun>("AdversarialMentorRun", MentorRunSchema)

let indexesReady: Promise<void> | null = null

export async function mentorDb(): Promise<void> {
    await dbConnect()
    indexesReady ??= MentorRun.createIndexes()
        .then(() => undefined)
        .catch((error: unknown) => {
            indexesReady = null
            throw error
        })
    await indexesReady
}
