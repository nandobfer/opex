import { Schema, model, models, type Model } from "mongoose"
import { dbConnect } from "@/lib/db"
import type { ParsedMessage } from "@/features/evolution-api/message"
import type { SecretaryDecision, SecretaryNoticeKind, SecretaryNoticeStatus } from "../constants"
import type { BlockChange, PersonalitySnapshot } from "../personality"

export interface ConversationState {
    _id: string
    instance: string
    jid: string
    token: string | null
    pending: ParsedMessage[]
    pausedUntil: Date | null
    lastOwnerMessageAt: Date | null
}
const conversationSchema = new Schema<ConversationState>({
    _id: String, instance: String, jid: String, token: String, pending: { type: Schema.Types.Mixed, default: [] }, pausedUntil: Date, lastOwnerMessageAt: Date,
}, { collection: "secretary_conversations", versionKey: false })
export const SecretaryConversation = (models.SecretaryConversation as Model<ConversationState> | undefined) ?? model<ConversationState>("SecretaryConversation", conversationSchema)

/** `origin: "test"`: mensagem de teste da integração (sem selo "Secretário" na aba Conversas, OPE-197). */
interface Sent { _id: string; sentAt: Date; origin?: "agent" | "test" }
const sentSchema = new Schema<Sent>({ _id: String, sentAt: Date, origin: String }, { collection: "secretary_sent", versionKey: false })
sentSchema.index({ sentAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 })
export const SecretarySent = (models.SecretarySent as Model<Sent> | undefined) ?? model<Sent>("SecretarySent", sentSchema)

interface Decision {
    _id: string
    instance: string
    chatId: string
    jid: string
    decision: SecretaryDecision
    reason: string
    topic: string | null
    costUsd: number
    at: Date
    /** Ids das mensagens que o turno enviou (selo "Secretário" na aba Conversas, OPE-197). */
    messageIds?: string[]
}
const decisionSchema = new Schema<Decision>({ _id: String, instance: String, chatId: String, jid: String, decision: String, reason: String, topic: String, costUsd: Number, at: Date, messageIds: [String] }, { collection: "secretary_decisions", versionKey: false })
decisionSchema.index({ instance: 1, chatId: 1, at: -1 })
decisionSchema.index({ at: -1 })
decisionSchema.index({ jid: 1, at: -1 })
export const SecretaryDecisionRecord = (models.SecretaryDecisionRecord as Model<Decision> | undefined) ?? model<Decision>("SecretaryDecisionRecord", decisionSchema)

export interface Notice {
    _id: string
    instance: string
    chatId: string
    jid: string
    kind: SecretaryNoticeKind
    status: SecretaryNoticeStatus
    text: string
    excerpt?: string
    author?: string
    contactName?: string
    sentMessageId: string | null
    answer: string | null
    memoryChannel: string | null
    at: Date
    trigger: ParsedMessage | null
    ownerRevision: Date | null
    /** Início da resposta em andamento (`status: answering`). */
    answeringAt: Date | null
}
const noticeSchema = new Schema<Notice>({ _id: String, instance: String, chatId: String, jid: String, kind: String, status: String, text: String,
    excerpt: String, author: String, contactName: String, sentMessageId: String, answer: String, memoryChannel: String, at: Date, trigger: Schema.Types.Mixed, ownerRevision: Date, answeringAt: Date,
}, { collection: "secretary_notices", versionKey: false })
noticeSchema.index({ instance: 1, status: 1, at: -1 })
export const SecretaryNotice = (models.SecretaryNotice as Model<Notice> | undefined) ?? model<Notice>("SecretaryNotice", noticeSchema)

export interface Version { _id: string; origin: "edit" | "analysis" | "analysis-cancelled" | "analysis-unapplied" | "restore"; snapshot: PersonalitySnapshot; changes: BlockChange[]; at: Date }
const versionSchema = new Schema<Version>({ _id: String, origin: String, snapshot: Schema.Types.Mixed, changes: [Schema.Types.Mixed], at: Date }, { collection: "secretary_personality_versions", versionKey: false })
versionSchema.index({ at: -1 })
export const SecretaryVersion = (models.SecretaryVersion as Model<Version> | undefined) ?? model<Version>("SecretaryVersion", versionSchema)
interface PersonalityState { _id: string; versionId: string; snapshot: PersonalitySnapshot }
const personalitySchema = new Schema<PersonalityState>({ _id: String, versionId: String, snapshot: Schema.Types.Mixed }, { collection: "secretary_personality", versionKey: false })
export const SecretaryPersonality = (models.SecretaryPersonality as Model<PersonalityState> | undefined) ?? model<PersonalityState>("SecretaryPersonality", personalitySchema)

let indexes: Promise<unknown> | undefined
export async function secretaryDb() {
    await dbConnect()
    indexes ??= Promise.all([SecretarySent.createIndexes(), SecretaryDecisionRecord.createIndexes(), SecretaryNotice.createIndexes(), SecretaryVersion.createIndexes()]).catch((error) => { indexes = undefined; throw error })
    await indexes
}
