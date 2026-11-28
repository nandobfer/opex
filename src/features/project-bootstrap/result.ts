import { bootstrapResultSchema, type BootstrapResult } from "./schemas"

/**
 * Resumo final do Agente de Bootstrap (módulo puro): o turno termina com um bloco
 * ` ```json bootstrap-result ` com a porta, o caminho de saúde, se há servidor, se usa MongoDB e a
 * branch do push. Vale o último bloco do texto; ausente ou inválido = `null` (o agente ainda não
 * terminou ou parou para perguntar algo).
 */

const BLOCK = /```json[ \t]+bootstrap-result[ \t]*\r?\n([\s\S]*?)```/g

export type ParsedBootstrapResult = { ok: true; result: BootstrapResult } | { ok: false; reason: "missing" | "invalid"; detail?: string }

export function parseBootstrapResult(text: string): ParsedBootstrapResult {
    const blocks = [...text.matchAll(BLOCK)]
    const last = blocks.at(-1)
    if (!last) return { ok: false, reason: "missing" }
    let raw: unknown
    try {
        raw = JSON.parse(last[1] ?? "")
    } catch {
        return { ok: false, reason: "invalid", detail: "o bloco não é um JSON válido" }
    }
    const parsed = bootstrapResultSchema.safeParse(raw)
    if (!parsed.success) {
        const issue = parsed.error.issues[0]
        return { ok: false, reason: "invalid", detail: issue ? `${issue.path.join(".") || "bloco"}: ${issue.message}` : "campos inválidos" }
    }
    return { ok: true, result: parsed.data }
}

/** Formato do bloco, como vai nas instruções do agente. */
export const BOOTSTRAP_RESULT_EXAMPLE = [
    "```json bootstrap-result",
    '{ "port": 4014, "healthPath": "/api/health", "hasServer": true, "usesMongo": true, "branch": "main" }',
    "```",
].join("\n")
