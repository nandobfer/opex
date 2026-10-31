import { Schema, model, models, type Model } from "mongoose"
import { dbConnect } from "@/lib/db"

/** Coleções da integração Engramind (índices garantidos no primeiro uso). Ver `aicontext/modules/engramind.md`. */

/** Ids de eventos de webhook já recebidos (descarta repetições; somem em 24 h). */
export interface IEngramindWebhookEvent {
    _id: string
    type: string
    receivedAt: Date
}

/** Estado da instalação (singleton `_id: "engramind"`): alterações do `.env` ainda não aplicadas. */
export interface IEngramindState {
    _id: string
    pendingApply: { keys: string[]; at: Date; previous: Record<string, string> } | null
}

const webhookEventSchema = new Schema<IEngramindWebhookEvent>(
    { _id: { type: String, required: true }, type: { type: String, required: true }, receivedAt: { type: Date, required: true } },
    { collection: "engramind_webhook_events", versionKey: false },
)
webhookEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 24 * 3600, name: "received_ttl" })

const stateSchema = new Schema<IEngramindState>(
    {
        _id: { type: String, required: true },
        pendingApply: { type: new Schema({ keys: [String], at: Date, previous: { type: Schema.Types.Mixed, default: {} } }, { _id: false }), default: null },
    },
    { collection: "engramind_state", versionKey: false },
)

export const EngramindWebhookEvent: Model<IEngramindWebhookEvent> =
    (models.EngramindWebhookEvent as Model<IEngramindWebhookEvent>) ?? model<IEngramindWebhookEvent>("EngramindWebhookEvent", webhookEventSchema)
export const EngramindState: Model<IEngramindState> = (models.EngramindState as Model<IEngramindState>) ?? model<IEngramindState>("EngramindState", stateSchema)

export const ENGRAMIND_STATE_ID = "engramind"

let indexesReady: Promise<void> | null = null

export async function engramindDb(): Promise<void> {
    await dbConnect()
    indexesReady ??= Promise.all([EngramindWebhookEvent.createIndexes(), EngramindState.createIndexes()])
        .then(() => undefined)
        .catch((error: unknown) => {
            indexesReady = null
            throw error
        })
    await indexesReady
}
