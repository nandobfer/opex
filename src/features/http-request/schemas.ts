import { z } from "zod"

/**
 * Ferramenta "Chamada HTTP" (OPE-130, D6/D7): requisição generalizada para qualquer endereço, com
 * controle completo de método, cabeçalhos, corpo e resposta. Contrato Zod único (ferramenta do Agente
 * Opex, MCP da execução do rotineiro e testes).
 */

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const
export const HTTP_RESPONSE_TYPES = ["auto", "text", "json", "base64", "none"] as const
export const DEFAULT_HTTP_TIMEOUT_SECONDS = 30
export const MAX_HTTP_TIMEOUT_SECONDS = 120
export const DEFAULT_HTTP_MAX_RESPONSE_BYTES = 1_048_576
export const MAX_HTTP_RESPONSE_BYTES = 5 * 1_048_576
export const MAX_HTTP_REDIRECTS = 10

const stringRecord = z.record(z.string(), z.string())

export const httpBodySchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("json"), value: z.unknown() }),
    z.object({ type: z.literal("text"), value: z.string(), contentType: z.string().optional() }),
    z.object({ type: z.literal("form"), fields: stringRecord }),
    z.object({
        type: z.literal("multipart"),
        fields: stringRecord.optional(),
        files: z.array(z.object({ field: z.string().min(1), filename: z.string().min(1), contentType: z.string().optional(), base64: z.string() })).max(10).optional(),
    }),
    z.object({ type: z.literal("base64"), value: z.string(), contentType: z.string().optional() }),
])
export type HttpBody = z.infer<typeof httpBodySchema>

export const httpRequestInputSchema = z.object({
    method: z.enum(HTTP_METHODS).default("GET").describe("Método HTTP"),
    url: z
        .string()
        .trim()
        .min(1)
        .max(8_000)
        .refine((value) => /^https?:\/\//i.test(value), "Use uma URL http:// ou https://")
        .describe("URL completa (http/https). Pode usar {{secret:NOME}}")
        .meta({ examples: ["https://api.exemplo.com/v1/itens"] }),
    query: stringRecord.optional().describe("Parâmetros acrescentados à URL"),
    headers: stringRecord.optional().describe("Cabeçalhos (qualquer um: Authorization, Cookie, User-Agent, Content-Type…). Pode usar {{secret:NOME}}"),
    body: httpBodySchema.optional().describe("Corpo: json (value), text (value, contentType), form (fields), multipart (fields, files em base64) ou base64 (value, contentType)"),
    timeoutSeconds: z.number().int().min(1).max(MAX_HTTP_TIMEOUT_SECONDS).default(DEFAULT_HTTP_TIMEOUT_SECONDS).describe("Tempo limite em segundos (padrão 30, máximo 120)"),
    followRedirects: z.boolean().default(true).describe("Seguir redirecionamentos (até 10). Com false, a resposta 3xx volta com o Location"),
    responseType: z.enum(HTTP_RESPONSE_TYPES).default("auto").describe("auto (JSON pelo content-type, texto legível ou base64), text, json, base64 ou none (só status e cabeçalhos)"),
    maxResponseBytes: z.number().int().min(1).max(MAX_HTTP_RESPONSE_BYTES).default(DEFAULT_HTTP_MAX_RESPONSE_BYTES).describe("Máximo de bytes lidos da resposta (padrão 1 MB, máximo 5 MB)"),
})
export type HttpRequestInput = z.infer<typeof httpRequestInputSchema>
export type HttpRequestInputRaw = z.input<typeof httpRequestInputSchema>

export interface HttpRequestOutput {
    /** Status 2xx. Uma resposta 4xx/5xx NÃO é erro da ferramenta: volta com `ok: false` e o corpo. */
    ok: boolean
    status: number
    statusText: string
    /** URL final (depois dos redirecionamentos), com os segredos mascarados. */
    url: string
    redirected: boolean
    /** Todos os cabeçalhos da resposta; `set-cookie` vem como lista. */
    headers: Record<string, string | string[]>
    contentType: string | null
    bodyType: "json" | "text" | "base64" | "none"
    body: unknown
    bytes: number
    truncated: boolean
    durationMs: number
}

/** Segredos à disposição da chamada (só o agente rotineiro tem; o valor nunca vai ao modelo). */
export interface HttpSecretVault {
    list(): { name: string; description: string; allowedHosts: string[] }[]
    value(name: string): string | undefined
    /** Registra o uso (sem esperar; falha vira aviso no log). */
    markUsed(names: string[]): void
}
