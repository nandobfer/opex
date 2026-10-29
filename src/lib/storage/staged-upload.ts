import { loggerFor } from "@/lib/logger"
import { copyFile, deleteFile, headFile, storageErrorInfo } from "@/lib/storage/s3"

/**
 * Envio em duas fases para o Storage S3 (SOMENTE servidor), compartilhado pelos arquivos do chat do
 * Agente Opex e da mesa de trabalho: o navegador faz o PUT numa chave temporária (URL assinada) e a
 * confirmação confere o objeto (HeadObject: existe, não está vazio, cabe no limite), promove para a
 * chave definitiva e apaga a temporária. Os metadados ficam com quem chama.
 */

// Logger sob demanda: os testes da mesa mocam `@/lib/logger` só com `logger`.
const log = () => loggerFor({ module: "storage", feature: "staged-upload" })

/**
 * Falha da confirmação. `unavailable` (conferência) e `promote_failed` (cópia para a chave definitiva):
 * o storage recusou ou não respondeu e a reserva continua válida (repetir sem reenviar). As demais já
 * removeram o objeto temporário: a reserva deve ser descartada.
 */
export type StagedUploadFailure = "unavailable" | "promote_failed" | "not_uploaded" | "empty" | "too_large"

export class StagedUploadError extends Error {
    constructor(
        readonly failure: StagedUploadFailure,
        /** Tamanho real conferido no storage (quando conhecido). */
        readonly size: number | null = null,
    ) {
        super(`Envio ao storage: ${failure}`)
        this.name = "StagedUploadError"
    }

    /** A reserva não serve mais (o objeto temporário não existe ou foi recusado). */
    get discard(): boolean {
        return this.failure !== "unavailable" && this.failure !== "promote_failed"
    }
}

/** Remove um objeto do storage sem lançar (devolve se conseguiu). */
export async function removeStoredObjectQuietly(key: string | null | undefined): Promise<boolean> {
    if (!key) return true
    try {
        await deleteFile(key)
        return true
    } catch (error) {
        log().warn({ err: error instanceof Error ? error.message : error, key }, "falha ao remover o objeto no storage")
        return false
    }
}

/** Confere o objeto temporário e o promove à chave definitiva. Devolve o tamanho real e o MIME informado ao storage. */
export async function promoteStagedUpload(input: { uploadKey: string; key: string; maxBytes: number }): Promise<{ size: number; contentType: string | undefined }> {
    let head: { contentLength: number | undefined; contentType: string | undefined }
    try {
        head = await headFile(input.uploadKey)
    } catch (error) {
        const info = storageErrorInfo(error)
        log().warn({ err: error instanceof Error ? error.message : error, key: input.uploadKey, httpStatus: info.httpStatus, code: info.code, kind: info.kind }, "falha ao conferir o arquivo na confirmação")
        if (info.kind !== "not_found") throw new StagedUploadError("unavailable")
        await removeStoredObjectQuietly(input.uploadKey)
        throw new StagedUploadError("not_uploaded")
    }
    const size = head.contentLength ?? 0
    if (size <= 0) {
        await removeStoredObjectQuietly(input.uploadKey)
        throw new StagedUploadError("empty", size)
    }
    if (size > input.maxBytes) {
        await removeStoredObjectQuietly(input.uploadKey)
        throw new StagedUploadError("too_large", size)
    }
    try {
        await copyFile(input.uploadKey, input.key)
    } catch (error) {
        log().warn({ err: error instanceof Error ? error.message : error, key: input.uploadKey }, "falha ao promover o arquivo para a chave definitiva")
        throw new StagedUploadError("promote_failed", size)
    }
    await removeStoredObjectQuietly(input.uploadKey)
    return { size, contentType: head.contentType?.trim() || undefined }
}
