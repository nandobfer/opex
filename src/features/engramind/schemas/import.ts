import { z } from "zod"
import { channelSlugSchema } from "../operations"

/** Um item de `import_memories` (mesmo contrato do Engramind). */
export const importItemSchema = z
    .object({
        text: z.string().trim().min(1, "Texto vazio").max(20_000),
        category: z.string().trim().min(1).max(40).optional(),
        created_at: z.string().datetime({ offset: true, message: "created_at: use RFC 3339" }).optional(),
        status: z.enum(["active", "permanent"]).optional(),
        author: z.object({ app: z.string().trim().min(1).max(80), agent: z.string().trim().min(1).max(80).optional() }).optional(),
        origin: z.object({ source: z.string().trim().min(1).max(80), label: z.string().trim().max(200).optional() }).optional(),
    })
    .strict()
export type ImportItem = z.infer<typeof importItemSchema>

/** Corpo de `POST /api/engramind/memories/import`. */
export const importInputSchema = z.object({
    channel: z.union([channelSlugSchema, z.string().regex(/^ch_[A-Za-z0-9]+$/)]),
    memories: z.array(importItemSchema).min(1, "O arquivo não tem memórias").max(1000),
})
export type ImportInput = z.infer<typeof importInputSchema>

export interface ImportParseResult {
    items: ImportItem[]
    errors: { index: number; message: string }[]
    /** O arquivo nem pôde ser lido (JSON inválido ou formato desconhecido). */
    fatal: string | null
}

/** Lê uma lista JSON, `{ "memories": [...] }` ou JSONL (um item por linha) e valida cada item. */
export function parseImportFile(content: string): ImportParseResult {
    const text = content.trim()
    if (!text) return { items: [], errors: [], fatal: "Arquivo vazio" }
    let raw: unknown[]
    try {
        const parsed: unknown = JSON.parse(text)
        if (Array.isArray(parsed)) raw = parsed
        else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { memories?: unknown }).memories)) raw = (parsed as { memories: unknown[] }).memories
        // JSONL de uma linha só: o arquivo inteiro é um item (objeto com `text`).
        else if (parsed && typeof parsed === "object" && "text" in parsed) raw = [parsed]
        else return { items: [], errors: [], fatal: "Use uma lista JSON, { \"memories\": [...] } ou JSONL" }
    } catch {
        raw = []
        const lines = text.split(/\r?\n/).filter((line) => line.trim())
        for (const [index, line] of lines.entries()) {
            try {
                raw.push(JSON.parse(line))
            } catch {
                return { items: [], errors: [{ index, message: "Linha não é JSON válido" }], fatal: `JSON inválido na linha ${index + 1}` }
            }
        }
    }
    const items: ImportItem[] = []
    const errors: ImportParseResult["errors"] = []
    raw.forEach((value, index) => {
        const parsed = importItemSchema.safeParse(value)
        if (parsed.success) items.push(parsed.data)
        else errors.push({ index, message: parsed.error.issues.map((issue) => `${issue.path.join(".") || "item"}: ${issue.message}`).join("; ") })
    })
    return { items, errors, fatal: null }
}

/** Recusa antes do envio o lote acima de `limits.max_batch`. */
export function batchLimitError(count: number, maxBatch: number | null | undefined): string | null {
    if (typeof maxBatch !== "number" || count <= maxBatch) return null
    return `O arquivo tem ${count} memórias e o limite por lote é ${maxBatch} (limits.max_batch). Divida o arquivo.`
}
