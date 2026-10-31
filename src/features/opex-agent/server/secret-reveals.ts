import { randomBytes } from "node:crypto"
import { Schema, model, models, type Model } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { decryptSecret, encryptSecret, type EncryptedSecret } from "@/lib/crypto/secretBox"
import { dbConnect } from "@/lib/db"
import type { RevealSecretAction } from "../result-actions"

/**
 * Segredos mostrados UMA vez pelo botão do card de uma ferramenta (ex.: "Ver token"). O valor fica
 * cifrado (`secretBox`) até a primeira leitura ou o prazo; o modelo e o histórico do chat nunca o veem.
 */

export interface IOpexSecretReveal {
    _id: string
    sealed: EncryptedSecret
    title: string
    expiresAt: Date
}

const schema = new Schema<IOpexSecretReveal>(
    { _id: { type: String, required: true }, sealed: { type: Schema.Types.Mixed, required: true }, title: { type: String, required: true }, expiresAt: { type: Date, required: true } },
    { collection: "opex_secret_reveals", versionKey: false },
)
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expires_ttl" })

export const OpexSecretReveal: Model<IOpexSecretReveal> = (models.OpexSecretReveal as Model<IOpexSecretReveal>) ?? model<IOpexSecretReveal>("OpexSecretReveal", schema)

let indexes: Promise<unknown> | null = null
async function db(): Promise<void> {
    await dbConnect()
    indexes ??= OpexSecretReveal.createIndexes().catch((error: unknown) => {
        indexes = null
        throw error
    })
    await indexes
}

/** Guarda o segredo cifrado e devolve a ação do card (`reveal-secret`). */
export async function createSecretReveal(secret: string, options: { title: string; label: string; ttlMs: number }): Promise<RevealSecretAction> {
    await db()
    const id = `rv_${randomBytes(18).toString("base64url")}`
    const expiresAt = new Date(Date.now() + options.ttlMs)
    await OpexSecretReveal.create({ _id: id, sealed: encryptSecret(secret), title: options.title, expiresAt })
    return { kind: "reveal-secret", id, label: options.label, title: options.title, expiresAt: expiresAt.toISOString() }
}

/** Primeira leitura: devolve e apaga. Já lido ou vencido: 410. */
export async function consumeSecretReveal(id: string): Promise<{ secret: string; title: string }> {
    await db()
    const doc = await OpexSecretReveal.findOneAndDelete({ _id: id, expiresAt: { $gt: new Date() } }).lean<IOpexSecretReveal>()
    if (!doc) throw new DomainError(410, "Já exibido ou vencido: revogue e emita outro.", "SECRET_REVEAL_GONE")
    return { secret: decryptSecret(doc.sealed), title: doc.title }
}
