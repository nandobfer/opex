import { parse, stringify } from "yaml"

/**
 * Markdown com frontmatter YAML (skills `SKILL.md`, agentes e comandos `.md` do OpenCode).
 * Módulo puro: a validação de cada tipo fica em `schemas.ts`.
 */

export interface MarkdownDocument {
    frontmatter: Record<string, unknown>
    body: string
}

export class FrontmatterError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "FrontmatterError"
    }
}

const FENCE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/** Separa frontmatter e corpo. Sem frontmatter, `frontmatter` vem vazio. YAML inválido lança `FrontmatterError`. */
export function parseMarkdownDocument(text: string): MarkdownDocument {
    const source = text.replace(/^\uFEFF/, "")
    const match = FENCE.exec(source)
    if (!match) return { frontmatter: {}, body: source }
    let data: unknown
    try {
        data = parse(match[1] ?? "")
    } catch (error) {
        throw new FrontmatterError(`Frontmatter inválido: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`)
    }
    if (data !== null && data !== undefined && (typeof data !== "object" || Array.isArray(data))) throw new FrontmatterError("Frontmatter inválido: precisa ser um objeto (chave: valor)")
    return { frontmatter: (data ?? {}) as Record<string, unknown>, body: source.slice(match[0].length) }
}

/** Monta o arquivo: frontmatter (sem chaves vazias) + corpo. */
export function serializeMarkdownDocument(doc: MarkdownDocument): string {
    const clean = Object.fromEntries(Object.entries(doc.frontmatter).filter(([, value]) => value !== undefined && value !== null && value !== ""))
    const body = doc.body.replace(/^\s*\n/, "")
    if (Object.keys(clean).length === 0) return body.endsWith("\n") ? body : `${body}\n`
    const yaml = stringify(clean, { lineWidth: 0 }).trimEnd()
    return `---\n${yaml}\n---\n\n${body.endsWith("\n") ? body : `${body}\n`}`
}
