import { createHash, timingSafeEqual } from "node:crypto"
import { Types } from "mongoose"
import { dbConnect } from "@/lib/db"
import { OpexMcpServer, type IOpexMcpOauth } from "@/lib/db/models/Opex"
import { decryptSecret, encryptSecret, isEncryptedSecret, type EncryptedSecret } from "@/lib/crypto/secretBox"

/**
 * Persistência do OAuth dos MCPs do Agente Opex (SOMENTE servidor): leitura/gravação do subdocumento
 * `oauth` de `opex_mcp_servers`. Tokens, cliente registrado, state e verificador ficam cifrados.
 */

export function emptyMcpOauth(): IOpexMcpOauth {
    return { clientId: "", clientSecret: null, scope: "", client: null, tokens: null, tokenVersion: 0, expiresAt: null, server: null, pending: null, status: "not_authorized", authorizedAt: null, lastError: null }
}

export const sealJson = (value: unknown): EncryptedSecret => encryptSecret(JSON.stringify(value))

/** JSON cifrado → objeto (`null` se ausente ou ilegível com a chave atual). */
export function openJson<T>(value: unknown): T | null {
    if (!isEncryptedSecret(value)) return null
    try {
        return JSON.parse(decryptSecret(value)) as T
    } catch {
        return null
    }
}

export function openText(value: unknown): string | null {
    if (!isEncryptedSecret(value)) return null
    try {
        return decryptSecret(value)
    } catch {
        return null
    }
}

export const hashState = (state: string) => createHash("sha256").update(state).digest()

/** Comparação em tempo constante de dois `state`. */
export function sameState(a: string, b: string): boolean {
    return timingSafeEqual(hashState(a), hashState(b))
}

export async function loadMcpOauth(id: string): Promise<IOpexMcpOauth | null> {
    if (!Types.ObjectId.isValid(id)) return null
    await dbConnect()
    const doc = await OpexMcpServer.findById(id).select({ oauth: 1 }).lean<{ oauth?: IOpexMcpOauth | null }>()
    return doc?.oauth ?? null
}

/**
 * Grava campos de `oauth` (caminhos `oauth.<campo>`). Só altera MCPs com o subdocumento; `filter`
 * acrescenta condições (ex.: a geração dos tokens). Devolve se algum documento foi alterado.
 */
export async function patchMcpOauth(id: string, set: Partial<IOpexMcpOauth>, options: { filter?: Record<string, unknown>; incTokenVersion?: boolean } = {}): Promise<boolean> {
    await dbConnect()
    const $set = Object.fromEntries(Object.entries(set).map(([key, value]) => [`oauth.${key}`, value]))
    const result = await OpexMcpServer.updateOne(
        { _id: id, oauth: { $ne: null }, ...(options.filter ?? {}) },
        { $set, ...(options.incTokenVersion ? { $inc: { "oauth.tokenVersion": 1 } } : {}) },
        { timestamps: false },
    )
    return (result.matchedCount ?? 0) > 0
}
