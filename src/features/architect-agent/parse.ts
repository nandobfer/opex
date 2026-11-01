import { rawGraphSchema, type RawGraph } from "./graph"

/**
 * Leitura da resposta do Agente Arquiteto (módulo PURO): o último bloco JSON com o grafo. `error`
 * descreve o problema em pt-BR e vai no pedido de correção (uma nova tentativa).
 */
export type ParsedArchitectOutput = { ok: true; raw: RawGraph } | { ok: false; error: string }

function candidates(text: string): string[] {
    const fenced = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((match) => match[1]!.trim()).reverse()
    const first = text.indexOf("{")
    const last = text.lastIndexOf("}")
    if (first >= 0 && last > first) fenced.push(text.slice(first, last + 1))
    return fenced
}

export function parseArchitectOutput(text: string): ParsedArchitectOutput {
    let lastError = "a resposta não trouxe um bloco JSON com o grafo"
    for (const candidate of candidates(text)) {
        let value: unknown
        try {
            value = JSON.parse(candidate)
        } catch {
            lastError = "o bloco JSON da resposta não é um JSON válido"
            continue
        }
        const parsed = rawGraphSchema.safeParse(value)
        if (parsed.success) return { ok: true, raw: parsed.data }
        lastError = `o JSON não segue o formato do grafo: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "raiz"}: ${issue.message}`).join("; ")}`
    }
    return { ok: false, error: lastError }
}
