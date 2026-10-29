/**
 * Storage S3 em memória com o subconjunto de `@/lib/storage/s3` usado pelos serviços (URL assinada,
 * HeadObject, cópia, leitura com stream, gravação e remoção). Use num `vi.mock` com `vi.hoisted`:
 *
 *   const s3 = vi.hoisted(() => ({ store: null as unknown as S3Memory }))
 *   vi.mock('@/lib/storage/s3', async () => (s3.store = (await import('../helpers/s3-memory')).s3Memory()))
 *
 * `put(key, conteúdo)` simula o PUT do navegador na URL assinada; `fail` força erros por operação.
 */

type Failure = { name?: string; $metadata?: { httpStatusCode?: number } }

const notFound = (): Failure & Error => Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } })

export function s3Memory() {
    const objects = new Map<string, { body: Uint8Array; contentType: string }>()
    const fail: Partial<Record<"head" | "copy" | "get" | "delete" | "upload" | "sign", Failure & Error>> = {}
    const toBytes = (value: Uint8Array | string) => (typeof value === "string" ? new TextEncoder().encode(value) : value)
    return {
        objects,
        fail,
        put(key: string, content: Uint8Array | string, contentType = "application/octet-stream") {
            objects.set(key, { body: toBytes(content), contentType })
        },
        reset() {
            objects.clear()
            for (const key of Object.keys(fail)) delete fail[key as keyof typeof fail]
        },
        getUploadUrl: async (key: string) => {
            if (fail.sign) throw fail.sign
            return `http://storage.test/bucket/${key}?X-Amz-Signature=x`
        },
        getFileUrl: async (key: string, options: { expiresIn?: number } = {}) => {
            if (fail.sign) throw fail.sign
            return `http://storage.test/bucket/${key}?X-Amz-Expires=${options.expiresIn ?? 900}&X-Amz-Signature=x`
        },
        headFile: async (key: string) => {
            if (fail.head) throw fail.head
            const object = objects.get(key)
            if (!object) throw notFound()
            return { contentType: object.contentType, contentLength: object.body.byteLength, lastModified: new Date() }
        },
        copyFile: async (from: string, to: string) => {
            if (fail.copy) throw fail.copy
            const object = objects.get(from)
            if (!object) throw notFound()
            objects.set(to, { ...object })
        },
        getFileObject: async (key: string) => {
            if (fail.get) throw fail.get
            const object = objects.get(key)
            if (!object) throw notFound()
            return { body: new Response(object.body.slice()).body, contentType: object.contentType, contentLength: object.body.byteLength, contentRange: undefined, acceptRanges: "bytes", lastModified: undefined, etag: undefined }
        },
        uploadFile: async (key: string, body: Uint8Array | string, contentType?: string) => {
            if (fail.upload) throw fail.upload
            objects.set(key, { body: toBytes(body), contentType: contentType ?? "application/octet-stream" })
        },
        deleteFile: async (key: string) => {
            if (fail.delete) throw fail.delete
            objects.delete(key)
        },
        storageErrorInfo: (error: unknown) => {
            const candidate = error as Failure | null
            const status = candidate?.$metadata?.httpStatusCode ?? null
            return { kind: status === 404 ? "not_found" : status === 403 ? "forbidden" : "unavailable", httpStatus: status, code: candidate?.name ?? null }
        },
    }
}

export type S3Memory = ReturnType<typeof s3Memory>
