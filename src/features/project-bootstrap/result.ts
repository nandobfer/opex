import { bootstrapResultSchema, type BootstrapResult } from "./schemas"

/**
 * Resumo final do Agente de Bootstrap (módulo puro): o turno termina com um bloco
 * ` ```json bootstrap-result ` com a porta, o caminho de saúde, se há servidor, se usa MongoDB e a
 * branch do push. Vale o último bloco do texto; ausente ou inválido = `null` (o agente ainda não
 * terminou ou parou para perguntar algo).
 */

const BLOCK = /```json[ \t]+bootstrap-result[ \t]*\r?\n([\s\S]*?)```/g

export type ParsedBootstrapResult = { ok: true; result: BootstrapResult } | { ok: false; reason: "missing" | "invalid"; detail?: string }

/** Com ambiente, `port` e `healthPath` são obrigatórios; sem ambiente, são ignorados (gravados como `null`). */
export function parseBootstrapResult(text: string, options: { withEnvironment: boolean } = { withEnvironment: true }): ParsedBootstrapResult {
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
    if (!options.withEnvironment) return { ok: true, result: { ...parsed.data, port: null, healthPath: null } }
    if (parsed.data.port == null) return { ok: false, reason: "invalid", detail: "port: informe a porta anotada" }
    if (parsed.data.healthPath == null) return { ok: false, reason: "invalid", detail: "healthPath: informe a rota de health check" }
    return { ok: true, result: parsed.data }
}

/** Formato do bloco, como vai nas instruções do agente (sem ambiente, sem porta nem health check). */
export function bootstrapResultExample(withEnvironment: boolean): string {
    const body = withEnvironment ? '{ "port": 4014, "healthPath": "/api/health", "hasServer": true, "usesMongo": true, "branch": "main" }' : '{ "hasServer": false, "usesMongo": false, "branch": "main" }'
    return ["```json bootstrap-result", body, "```"].join("\n")
}

export const BOOTSTRAP_RESULT_EXAMPLE = bootstrapResultExample(true)
