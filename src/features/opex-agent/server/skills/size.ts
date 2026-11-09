import mongoose from "mongoose"
import { DomainError } from "@/lib/api/route"
import { OPEX_SKILL_MAX_DOC_BYTES } from "./constants"

/**
 * Limite técnico (D5): a skill inteira (corpo + arquivos de apoio) é um documento do MongoDB, que aceita
 * até 16 MiB. Acima disso a gravação é recusada antes de começar (nada gravado pela metade).
 */

const mb = (bytes: number) => (bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })

export function tooLargeError(bytes: number | null): DomainError {
    const size = bytes === null ? "A skill" : `A skill tem ${mb(bytes)} MB e`
    return new DomainError(413, `${size} passa do limite técnico do banco (16 MB por skill). Nada foi gravado: reduza o corpo ou os arquivos de apoio.`, "OPEX_SKILL_TOO_LARGE")
}

/** Tamanho do documento em BSON. */
export function skillDocBytes(doc: Record<string, unknown>): number {
    return mongoose.mongo.BSON.calculateObjectSize(doc)
}

export function assertSkillFitsDb(doc: Record<string, unknown>): void {
    const bytes = skillDocBytes(doc)
    if (bytes > OPEX_SKILL_MAX_DOC_BYTES) throw tooLargeError(bytes)
}

/** Erro do driver por documento grande demais (caso a conferência prévia não pegue). */
export function isTooLargeError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false
    const { name, message, code } = error as { name?: string; message?: string; code?: number }
    return name === "BSONObjectTooLarge" || code === 10334 || /too large|BSONObjectTooLarge|exceeds maximum/i.test(message ?? "")
}

/** Bytes de um arquivo lido do banco (`.lean()` devolve `Binary` do BSON; documento hidratado, `Buffer`). */
export function bytesOf(content: unknown): Buffer {
    if (Buffer.isBuffer(content)) return content
    if (content instanceof Uint8Array) return Buffer.from(content)
    const binary = content as { read?: (position: number, length: number) => Uint8Array; length?: () => number } | null
    if (binary && typeof binary.read === "function" && typeof binary.length === "function") return Buffer.from(binary.read(0, binary.length()))
    return Buffer.alloc(0)
}
