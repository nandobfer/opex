import { z } from "zod"
import { personalityBlockSchema } from "./schemas"

/**
 * Entrega da análise de personalidade: o modelo vê um schema tolerante (chave livre, título sem limite rígido, variante
 * opcional) e o servidor normaliza só o formato antes do schema estrito. A normalização nunca inventa conteúdo: o que
 * falta continua inválido e volta ao modelo para corrigir.
 */

const KEY_MAX = 60
const TITLE_MAX = 80
const CONTENT_MAX = 8000

const looseBlock = z.object({ key: z.string().optional(), title: z.string(), content: z.string() })
/** Blocos como lista ou como string JSON (alguns modelos serializam arrays aninhados). */
const looseBlocks = z.union([z.array(looseBlock), z.string()])

export const analysisDeliverySchema = z.object({
    blocks: looseBlocks,
    variant: z.object({ title: z.string(), blocks: looseBlocks }).nullable().optional(),
})

export const analysisResultSchema = z.object({
    blocks: z.array(personalityBlockSchema).max(40),
    variant: z.object({ title: z.string().max(TITLE_MAX), blocks: z.array(personalityBlockSchema).max(40) }).nullable(),
})
export type AnalysisResult = z.infer<typeof analysisResultSchema>

/** Chave em slug: minúsculas, sem acento, `_`/espaço viram `-`, até 60 caracteres. */
export function slugKey(value: string): string {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, KEY_MAX).replace(/-+$/, "")
}

function parseBlocks(value: unknown): unknown {
    if (typeof value !== "string") return value
    try { return JSON.parse(value) } catch { return value }
}

function normalizeBlocks(value: unknown): unknown {
    const blocks = parseBlocks(value)
    if (!Array.isArray(blocks)) return blocks
    const merged = new Map<string, { key: string; title: string; content: string }>()
    for (const item of blocks) {
        if (!item || typeof item !== "object") return blocks
        const raw = item as { key?: unknown; title?: unknown; content?: unknown }
        if (typeof raw.title !== "string" || typeof raw.content !== "string") return blocks
        const title = raw.title.trim().slice(0, TITLE_MAX)
        const key = slugKey(typeof raw.key === "string" && raw.key.trim() ? raw.key : title)
        const prior = merged.get(key)
        const content = (prior ? `${prior.content}\n\n${raw.content}` : raw.content).slice(0, CONTENT_MAX)
        merged.set(key, { key, title: prior?.title ?? title, content })
    }
    return [...merged.values()]
}

/** Ajusta só o formato da entrega do modelo; o resultado ainda passa por `analysisResultSchema`. */
export function normalizeAnalysisDelivery(raw: unknown): unknown {
    if (!raw || typeof raw !== "object") return raw
    const value = raw as { blocks?: unknown; variant?: unknown }
    const variant = value.variant as { title?: unknown; blocks?: unknown } | null | undefined
    return {
        blocks: normalizeBlocks(value.blocks),
        variant: variant && typeof variant === "object"
            ? { title: typeof variant.title === "string" ? variant.title.trim().slice(0, TITLE_MAX) : variant.title, blocks: normalizeBlocks(variant.blocks) }
            : null,
    }
}
