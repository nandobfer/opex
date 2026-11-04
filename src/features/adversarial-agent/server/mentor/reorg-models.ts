import { Schema, model, models, type Model, type Types } from "mongoose"
import { dbConnect } from "@/lib/db"
import type { MentorReorgAction, MentorReorgItemStatus, MentorReorgStatus, MentorTarget } from "../../mentor/constants"

/**
 * Reorganização do acervo do Agente Mentor (OPE-132): `adversarial_mentor_reorganizations` guarda a
 * execução (recorte, progresso, custo e situação) e `adversarial_mentor_reorg_items` o Plano de
 * reorganização, um documento por memória (permite decidir e aplicar item a item, com reivindicação
 * atômica). Índices garantidos no primeiro uso.
 */

export interface IReorgMemory {
    target: MentorTarget
    centralId: string | null
    memoryId: string
    resumo: string
    texto: string
    versao: number
    owner: boolean
}

export interface IMentorReorgItem {
    _id: Types.ObjectId
    reorgId: string
    memoryId: string
    origin: IReorgMemory
    action: MentorReorgAction
    target: MentorTarget
    centralId: string | null
    text: string | null
    mergeInto: string | null
    mergeIntoResumo: string | null
    reason: string
    note: string | null
    routerConfidence: number | null
    routerReason: string | null
    sanitizerReason: string | null
    moveBlocked: boolean
    ownerMemory: boolean
    status: MentorReorgItemStatus
    error: string | null
    createdAt: Date
    updatedAt: Date
}

export interface IMentorReorg {
    _id: Types.ObjectId
    status: MentorReorgStatus
    targets: MentorTarget[]
    centralIds: string[]
    total: number
    done: number
    costUsd: number
    durationMs: number | null
    error: string | null
    startedAt: Date | null
    finishedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const MentorReorgSchema = new Schema<IMentorReorg>(
    {
        status: { type: String, required: true },
        targets: { type: [String], default: [] },
        centralIds: { type: [String], default: [] },
        total: { type: Number, default: 0 },
        done: { type: Number, default: 0 },
        costUsd: { type: Number, default: 0 },
        durationMs: { type: Number, default: null },
        error: { type: String, default: null },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null },
    },
    { collection: "adversarial_mentor_reorganizations", versionKey: false, timestamps: true },
)
MentorReorgSchema.index({ createdAt: -1 })
MentorReorgSchema.index({ status: 1, createdAt: -1 })

const MentorReorgItemSchema = new Schema<IMentorReorgItem>(
    {
        reorgId: { type: String, required: true },
        memoryId: { type: String, required: true },
        origin: { type: Schema.Types.Mixed, required: true },
        action: { type: String, required: true },
        target: { type: String, required: true },
        centralId: { type: String, default: null },
        text: { type: String, default: null },
        mergeInto: { type: String, default: null },
        mergeIntoResumo: { type: String, default: null },
        reason: { type: String, default: "" },
        note: { type: String, default: null },
        routerConfidence: { type: Number, default: null },
        routerReason: { type: String, default: null },
        sanitizerReason: { type: String, default: null },
        moveBlocked: { type: Boolean, default: false },
        ownerMemory: { type: Boolean, default: false },
        status: { type: String, required: true },
        error: { type: String, default: null },
    },
    { collection: "adversarial_mentor_reorg_items", versionKey: false, timestamps: true },
)
MentorReorgItemSchema.index({ reorgId: 1, createdAt: 1 })
MentorReorgItemSchema.index({ reorgId: 1, status: 1 })

export const MentorReorg: Model<IMentorReorg> = (models.AdversarialMentorReorg as Model<IMentorReorg>) || model<IMentorReorg>("AdversarialMentorReorg", MentorReorgSchema)
export const MentorReorgItem: Model<IMentorReorgItem> =
    (models.AdversarialMentorReorgItem as Model<IMentorReorgItem>) || model<IMentorReorgItem>("AdversarialMentorReorgItem", MentorReorgItemSchema)

let indexesReady: Promise<void> | null = null

export async function reorgDb(): Promise<void> {
    await dbConnect()
    indexesReady ??= Promise.all([MentorReorg.createIndexes(), MentorReorgItem.createIndexes()])
        .then(() => undefined)
        .catch((error: unknown) => {
            indexesReady = null
            throw error
        })
    await indexesReady
}
