import { z } from "zod"
import { BASE_PATH } from "@/lib/base-path"
import packageJson from "../../../../package.json"
import { whoAmIResponseSchema } from "../schemas"

/**
 * Especificação OpenAPI 3.1 da API interna: os endpoints públicos do app autenticados apenas por
 * token de sistema (Integrações › API interna). Corpos e respostas saem dos MESMOS schemas Zod
 * usados pelas rotas (`z.toJSONSchema`).
 *
 * REGRA (AGENTS.md): toda rota pública por token entra aqui. Criar, alterar ou remover uma rota
 * exige atualizar este arquivo — e `PUBLIC_TOKEN_ROUTES` — no mesmo commit.
 */

type JsonObject = Record<string, unknown>

export const SECURITY_SCHEMES = {
    apiToken: "apiToken",
} as const

/** Rotas públicas por token documentadas. */
export const PUBLIC_TOKEN_ROUTES = [{ path: "/api/v1/whoami" }] as const

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })

const jsonContent = (schema: JsonObject, example?: unknown) => ({
    "application/json": { schema, ...(example !== undefined ? { example } : {}) },
})

/** JSON Schema de um schema Zod, sem o `$schema` do documento. */
function fromZod(schema: z.ZodType, io: "input" | "output" = "output"): JsonObject {
    const { $schema: _ignored, ...json } = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as JsonObject
    void _ignored
    return json
}

const errorResponse = (description: string, error: string, code?: string) => ({
    description,
    content: jsonContent(ref("ApiError"), { success: false, error, ...(code ? { code } : {}) }),
})

export interface PublicApiSpecOptions {
    /** Sobrescreve a versão (testes). Padrão: `version` do `package.json`. */
    version?: string
}

export function buildPublicApiSpec(options: PublicApiSpecOptions = {}): JsonObject {
    const version = options.version ?? packageJson.version

    return {
        openapi: "3.1.0",
        info: {
            title: "API interna do Opex",
            version,
            description: [
                "Endpoints públicos do Opex autenticados por token de sistema, para scripts, agentes e outros sistemas.",
                "",
                "`Authorization: Bearer mt_sys_…` com um token gerado em Integrações › API interna. O valor aparece uma única vez,",
                "ao gerar; token revogado não volta.",
            ].join("\n"),
        },
        servers: [{ url: BASE_PATH || "/", description: "Mesmo host desta documentação (com o subcaminho público do app)" }],
        tags: [{ name: "Token", description: "Conferência do token de sistema." }],
        paths: {
            "/api/v1/whoami": {
                get: {
                    operationId: "whoAmI",
                    tags: ["Token"],
                    summary: "Confere o token",
                    description: "Responde com o nome e o prefixo do token usado na chamada. Útil para validar a configuração de um cliente.",
                    security: [{ [SECURITY_SCHEMES.apiToken]: [] }],
                    responses: {
                        "200": {
                            description: "Token válido.",
                            content: jsonContent(ref("WhoAmIResponse"), { success: true, data: { token: { id: "66f0c0ffee0000000000abcd", nome: "Script de relatórios", prefixo: "mt_sys_AbCdEfGh" } } }),
                        },
                        "401": errorResponse("Token ausente, inválido ou revogado.", "Token ausente, inválido ou revogado", "UNAUTHENTICATED"),
                    },
                },
            },
        },
        components: {
            securitySchemes: {
                [SECURITY_SCHEMES.apiToken]: {
                    type: "http",
                    scheme: "bearer",
                    description: "Token de sistema (`mt_sys_…`) gerado em Integrações › API interna.",
                },
            },
            schemas: {
                WhoAmIResponse: {
                    type: "object",
                    properties: { success: { const: true }, data: fromZod(whoAmIResponseSchema) },
                    required: ["success", "data"],
                },
                ApiError: {
                    type: "object",
                    properties: { success: { const: false }, error: { type: "string" }, code: { type: "string" }, details: {} },
                    required: ["success", "error"],
                },
            },
        },
    }
}
