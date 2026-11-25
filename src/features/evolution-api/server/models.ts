import { Schema, model, models, type Model } from "mongoose"
import { dbConnect } from "@/lib/db"

/** Coleções da integração Evolution API (OPE-192). Ver `aicontext/modules/evolution-api.md`. */

export interface IEvolutionQr {
    base64: string | null
    code: string | null
    pairingCode: string | null
    /** Quantos QR codes a instância já gerou nesta tentativa (limite da Evolution). */
    count: number
    generatedAt: Date
    /** `qr` (QR code) ou `pairing` (código numérico para digitar no celular). */
    mode: "qr" | "pairing"
}

export interface IEvolutionLastEvent {
    at: Date
    event: string
    ok: boolean
    message: string | null
}

/** Estado de uma instância (um documento por nome). */
export interface IEvolutionInstanceState {
    _id: string
    /** `open` | `connecting` | `close` | `refused`. */
    state: string
    ownerJid: string | null
    /** JID `@lid` do dono (endereçamento por LID em grupos), aprendido das mensagens dele em grupos. */
    ownerLid?: string | null
    profileName: string | null
    profilePictureUrl: string | null
    qr: IEvolutionQr | null
    /** Fim do pareamento pelo limite de QR (`refused`): a tela pede "Gerar novo QR". */
    qrLimitReached: boolean
    lastEvent: IEvolutionLastEvent | null
    webhookRegisteredAt: Date | null
    webhookError: string | null
    updatedAt: Date
}

/** Ids de eventos de mensagem já recebidos (descarta repetições; somem em 7 dias). */
export interface IEvolutionSeenEvent {
    _id: string
    receivedAt: Date
}

/** Contato, grupo ou conversa com nome e foto (cache para os seletores e rótulos). */
export interface IEvolutionContact {
    _id: string
    instance: string
    jid: string
    name: string | null
    pushName: string | null
    pictureUrl: string | null
    isGroup: boolean
    /** Apareceu na lista de conversas (findChats ou mensagem recebida). */
    hasChat: boolean
    lastMessageAt: Date | null
    updatedAt: Date
}

const qrSchema = new Schema<IEvolutionQr>(
    {
        base64: { type: String, default: null },
        code: { type: String, default: null },
        pairingCode: { type: String, default: null },
        count: { type: Number, default: 0 },
        generatedAt: { type: Date, required: true },
        mode: { type: String, enum: ["qr", "pairing"], default: "qr" },
    },
    { _id: false },
)

const instanceSchema = new Schema<IEvolutionInstanceState>(
    {
        _id: { type: String, required: true },
        state: { type: String, default: "close" },
        ownerJid: { type: String, default: null },
        ownerLid: { type: String, default: null },
        profileName: { type: String, default: null },
        profilePictureUrl: { type: String, default: null },
        qr: { type: qrSchema, default: null },
        qrLimitReached: { type: Boolean, default: false },
        lastEvent: { type: new Schema({ at: Date, event: String, ok: Boolean, message: { type: String, default: null } }, { _id: false }), default: null },
        webhookRegisteredAt: { type: Date, default: null },
        webhookError: { type: String, default: null },
        updatedAt: { type: Date, default: () => new Date() },
    },
    { collection: "evolution_instances", versionKey: false },
)

const seenSchema = new Schema<IEvolutionSeenEvent>({ _id: { type: String, required: true }, receivedAt: { type: Date, required: true } }, { collection: "evolution_seen_events", versionKey: false })
seenSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600, name: "received_ttl" })

const contactSchema = new Schema<IEvolutionContact>(
    {
        _id: { type: String, required: true },
        instance: { type: String, required: true },
        jid: { type: String, required: true },
        name: { type: String, default: null },
        pushName: { type: String, default: null },
        pictureUrl: { type: String, default: null },
        isGroup: { type: Boolean, default: false },
        hasChat: { type: Boolean, default: false },
        lastMessageAt: { type: Date, default: null },
        updatedAt: { type: Date, default: () => new Date() },
    },
    { collection: "evolution_contacts", versionKey: false },
)
contactSchema.index({ instance: 1, jid: 1 }, { unique: true, name: "instance_jid" })

export const EvolutionInstanceState: Model<IEvolutionInstanceState> =
    (models.EvolutionInstanceState as Model<IEvolutionInstanceState>) ?? model<IEvolutionInstanceState>("EvolutionInstanceState", instanceSchema)
export const EvolutionSeenEvent: Model<IEvolutionSeenEvent> = (models.EvolutionSeenEvent as Model<IEvolutionSeenEvent>) ?? model<IEvolutionSeenEvent>("EvolutionSeenEvent", seenSchema)
export const EvolutionContact: Model<IEvolutionContact> = (models.EvolutionContact as Model<IEvolutionContact>) ?? model<IEvolutionContact>("EvolutionContact", contactSchema)

let indexesReady: Promise<void> | null = null

export async function evolutionDb(): Promise<void> {
    await dbConnect()
    indexesReady ??= Promise.all([EvolutionSeenEvent.createIndexes(), EvolutionContact.createIndexes()])
        .then(() => undefined)
        .catch((error: unknown) => {
            indexesReady = null
            throw error
        })
    await indexesReady
}

export const contactKey = (instance: string, jid: string) => `${instance}:${jid}`
