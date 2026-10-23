import { z } from "zod"
import { clipLine, lineHash } from "@/lib/markdown/lines"
import type { LineCommentField, TaskLineRef } from "../types"

/**
 * Comentário de linha gravado como comentário comum da tarefa (`task_comments`, só texto): citação
 * visível da linha, o comentário e um comentário HTML oculto com a referência
 * (`<!-- opex:line {json} -->`). O react-markdown descarta HTML cru, então o marcador nunca aparece.
 */

/** Marcador do comentário HTML oculto que liga o comentário à linha. */
export const LINE_COMMENT_MARKER = "opex:line"
/** Limite por comentário (o mesmo da rota de comentários). */
export const TASK_COMMENT_MAX = 5000
export const LINE_QUOTE_MAX = 300
/** Prefixo do id do comentário otimista (ainda não confirmado pelo servidor). */
export const OPTIMISTIC_COMMENT_PREFIX = "optimistic-"

export const LINE_COMMENT_FIELD_LABELS: Record<LineCommentField, string> = {
    description: "Descrição",
    technicalSpec: "Especificação técnica",
    comment: "comentário",
}

const MARKER_PATTERN = /^[a-z0-9][a-z0-9:_-]{2,39}$/

/** Marcador válido (sem `--`, `>`…); inválido cai no padrão `opex:line`. */
export function lineMarkerOf(value: unknown): string {
    const marker = typeof value === "string" ? value.trim() : ""
    return MARKER_PATTERN.test(marker) && !marker.includes("--") ? marker : LINE_COMMENT_MARKER
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const payloadSchema = z.object({
    v: z.literal(1),
    f: z.enum(["description", "technicalSpec", "comment"]),
    c: z.string().min(1).nullable().optional(),
    l: z.number().int().positive(),
    h: z.string().regex(/^[0-9a-f]{8}$/),
})

export interface LineCommentInput {
    field: LineCommentField
    commentId?: string | null
    line: number
    /** Texto da linha (citação). */
    text: string
}

function header(field: LineCommentField, line: number): string {
    const label = LINE_COMMENT_FIELD_LABELS[field]
    return field === "comment" ? `> 💬 Linha ${line} de um **${label}**:` : `> 💬 Linha ${line} da **${label}**:`
}

/** Monta o texto do comentário. Lança `RangeError` quando passa do limite mesmo com a citação cortada. */
export function formatLineComment(body: string, ref: LineCommentInput, marker: string = LINE_COMMENT_MARKER): string {
    const quote = clipLine(ref.text.replace(/\s+/g, " ").trim(), LINE_QUOTE_MAX)
    const payload = JSON.stringify({ v: 1, f: ref.field, c: ref.field === "comment" ? (ref.commentId ?? null) : null, l: ref.line, h: lineHash(ref.text) })
    const content = `${header(ref.field, ref.line)}\n> ${quote || "…"}\n\n${body.trim()}\n\n<!-- ${lineMarkerOf(marker)} ${payload} -->`
    if (content.length > TASK_COMMENT_MAX) throw new RangeError(`Comentário de linha passa de ${TASK_COMMENT_MAX} caracteres`)
    return content
}

export interface ParsedComment {
    /** Sem o marcador oculto. */
    content: string
    body: string
    lineRef: TaskLineRef | null
}

/** Separa a citação, o corpo e a referência de um comentário (sem marcador = comentário comum). */
export function parseLineComment(raw: string, marker: string = LINE_COMMENT_MARKER): ParsedComment {
    const pattern = new RegExp(`\\s*<!--\\s*${escapeRegex(lineMarkerOf(marker))}\\s+(\\{[^]*?\\})\\s*-->\\s*$`)
    const match = pattern.exec(raw)
    if (!match) return { content: raw, body: raw, lineRef: null }
    const content = raw.slice(0, match.index).trimEnd()
    let payload: z.infer<typeof payloadSchema>
    try {
        const parsed = payloadSchema.safeParse(JSON.parse(match[1]!))
        if (!parsed.success) return { content, body: content, lineRef: null }
        payload = parsed.data
    } catch {
        return { content, body: content, lineRef: null }
    }
    const lines = content.split(/\r?\n/)
    let index = 0
    const quoted: string[] = []
    while (index < lines.length && lines[index]!.startsWith(">")) quoted.push(lines[index++]!.replace(/^>\s?/, ""))
    const body = lines.slice(index).join("\n").trim()
    // A primeira linha citada é o cabeçalho ("💬 Linha N da …").
    const quote = quoted.slice(1).join(" ").trim()
    return {
        content,
        body,
        lineRef: { field: payload.f, commentId: payload.f === "comment" ? (payload.c ?? null) : null, line: payload.l, hash: payload.h, quote },
    }
}

/** Texto do comentário para prompts e ferramentas: sem o marcador oculto. */
export function stripLineMarker(raw: string, marker: string = LINE_COMMENT_MARKER): string {
    return parseLineComment(raw, marker).content
}
