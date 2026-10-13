import { dbConnect } from "@/lib/db"
import { EnvironmentImage } from "@/lib/db/models/EnvironmentImage"
import type { ParsedImage } from "../parsers"
import type { EnvironmentImageDto } from "../types"

/**
 * Metadados das imagens de um ambiente. O Docker do host dá a lista real; o Opex complementa com
 * `{ tag, dbVersion, builtAt, origin, commitSha }` gravados na publicação. Imagem sem metadados
 * permanece `origin: "unknown"` (exige confirmação para restaurar).
 */

interface ImageMetadata {
    imageId: string
    tag: string | null
    dbVersion: string | null
    builtAt: Date | null
    origin: "opex" | "cd" | "unknown"
    service: string | null
    commitSha: string | null
}

/** Junta a lista do host com os metadados gravados (puro, para testes). */
export function mergeImageMetadata(hostImages: readonly ParsedImage[], metadata: readonly ImageMetadata[]): EnvironmentImageDto[] {
    const byId = new Map(metadata.map((meta) => [meta.imageId, meta]))
    const byTag = new Map(metadata.filter((meta) => meta.tag).map((meta) => [meta.tag as string, meta]))
    return hostImages.map((image) => {
        const meta = byId.get(image.id) ?? (image.tag ? byTag.get(image.tag) : undefined)
        return {
            id: image.id,
            tag: image.tag,
            dbVersion: meta?.dbVersion ?? null,
            builtAt: meta?.builtAt ? new Date(meta.builtAt).toISOString() : image.createdAt,
            origin: meta?.origin ?? "unknown",
            service: meta?.service ?? null,
            commitSha: meta?.commitSha ?? null,
        }
    })
}

export async function loadImageMetadata(environmentId: string): Promise<ImageMetadata[]> {
    await dbConnect()
    const docs = await EnvironmentImage.find({ environmentId }).lean()
    return docs.map((doc) => ({
        imageId: doc.imageId,
        tag: doc.tag ?? null,
        dbVersion: doc.dbVersion ?? null,
        builtAt: doc.builtAt ?? null,
        origin: doc.origin ?? "unknown",
        service: doc.service ?? null,
        commitSha: doc.commitSha ?? null,
    }))
}

export async function findImageMetadata(environmentId: string, imageId: string): Promise<ImageMetadata | null> {
    await dbConnect()
    const doc = await EnvironmentImage.findOne({ environmentId, imageId }).lean()
    if (!doc) return null
    return {
        imageId: doc.imageId,
        tag: doc.tag ?? null,
        dbVersion: doc.dbVersion ?? null,
        builtAt: doc.builtAt ?? null,
        origin: doc.origin ?? "unknown",
        service: doc.service ?? null,
        commitSha: doc.commitSha ?? null,
    }
}
