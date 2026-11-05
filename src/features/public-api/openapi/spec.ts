import { z } from "zod"
import { BASE_PATH } from "@/lib/base-path"
import packageJson from "../../../../package.json"
import type { MaddoxMcpDocsCatalog } from "@/features/maddox-agent/server/mcp-catalog"
import { API_SCOPE_ALL, MCP_OWNER_ALL_TOOLS, MCP_OWNER_DESTRUCTIVE, MCP_OWNER_SCOPE, MADDOX_TOKEN_EXCLUDED_GROUPS } from "@/features/integrations/api-tokens/scopes"
import { API_TOKEN_SECURITY_SCHEME, publicRouteScope } from "../routes"
import { whoAmIResponseSchema } from "../schemas"
import { routineWebhookBodySchema, routineWebhookResponseSchema } from "@/features/routine-agents/schemas"
import { buildMaddoxMcpSpecSection } from "./maddox-mcp"

/**
 * Especificação OpenAPI 3.1 da API interna: os endpoints públicos do app autenticados apenas por
 * token de sistema (Integrações › API interna). Corpos e respostas saem dos MESMOS schemas Zod
 * usados pelas rotas (`z.toJSONSchema`).
 *
 * Com o catálogo do MCP do Agente Maddox (`maddoxTools`, carregado pela rota), inclui o servidor MCP
 * do Opex e todas as ferramentas dele, geradas do mesmo catálogo do `tools/list` (`maddox-mcp.ts`).
 *
 * REGRA (AGENTS.md): toda rota pública por token entra aqui. Criar, alterar ou remover uma rota
 * exige atualizar este arquivo — e `PUBLIC_TOKEN_ROUTES` — no mesmo commit.
 */

type JsonObject = Record<string, unknown>

export const SECURITY_SCHEMES = {
    apiToken: API_TOKEN_SECURITY_SCHEME,
} as const

/** Catálogo de escopos do token de sistema (descrição do esquema `apiToken`). */
export const API_TOKEN_SCOPE_DOCS: readonly { scope: string; description: string }[] = [
    { scope: API_SCOPE_ALL, description: "Todas as rotas da API v1 que exigem escopo (atuais e futuras)." },
    { scope: "api:v1:<recurso>", description: "Uma rota da API v1 (o escopo exigido aparece em cada operação)." },
    { scope: "api:v1:routine-agents", description: "Webhook externo dos agentes rotineiros: disparar execuções (`POST /api/v1/routine-agents/{id}/runs`)." },
    { scope: MCP_OWNER_SCOPE, description: "Usar o servidor MCP do dono (initialize, ping, tools/list) e as ferramentas do grupo Contexto." },
    { scope: MCP_OWNER_ALL_TOOLS, description: "Todas as ferramentas do MCP do dono, inclusive as que forem adicionadas depois." },
    { scope: "mcp:owner:group:<grupo>", description: "As ferramentas de um grupo (dinâmico: ferramenta nova do grupo entra sozinha)." },
    { scope: "mcp:owner:tool:<nome>", description: "Uma ferramenta específica." },
    { scope: MCP_OWNER_DESTRUCTIVE, description: "Libera, entre as concedidas, as destrutivas e as que pedem confirmação por padrão (pelo token não há confirmação no chat). Sem ele, são recusadas." },
]

/** Segurança, escopo exigido e 403 de uma operação por token (`scope: null` = qualquer token válido). */
export function tokenOperationSecurity(scope: string | null): JsonObject {
    return {
        security: [{ [SECURITY_SCHEMES.apiToken]: scope ? [scope] : [] }],
        "x-opex-required-scope": scope,
    }
}

export const scopeSentence = (scope: string | null) => (scope ? `Escopo exigido: \`${scope}\` (ou \`${API_SCOPE_ALL}\`).` : "Escopo exigido: nenhum — qualquer token válido.")

export const insufficientScopeResponse = (required: string) => ({
    description: "Token válido, mas sem o escopo exigido pela operação.",
    content: {
        "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
            example: { success: false, error: `Este token não tem o escopo ${required}. Edite os escopos em Integrações › API interna.`, code: "INSUFFICIENT_SCOPE", details: { required } },
        },
    },
})

/** Rotas públicas por token documentadas (com o escopo de cada uma): `../routes.ts`. */
export { PUBLIC_TOKEN_ROUTES } from "../routes"

const ROUTINE_RUNS_SCOPE = publicRouteScope("/api/v1/routine-agents/{id}/runs") as string

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
    /** Catálogo do MCP do Agente Maddox; ausente = especificação só com as rotas por token. */
    maddoxTools?: MaddoxMcpDocsCatalog
}

export function buildPublicApiSpec(options: PublicApiSpecOptions = {}): JsonObject {
    const version = options.version ?? packageJson.version
    const mcp = options.maddoxTools ? buildMaddoxMcpSpecSection(options.maddoxTools) : null

    return {
        openapi: "3.1.0",
        info: {
            title: "API interna do Opex",
            version,
            description: [
                "Endpoints públicos do Opex autenticados por token de sistema, para scripts, agentes e outros sistemas.",
                "",
                "`Authorization: Bearer mt_sys_…` com um token gerado em Integrações › API interna. O valor aparece uma única vez,",
                "ao gerar; token revogado não volta e token expirado deixa de valer.",
                "",
                "**Escopos**: cada token recebe escopos (catálogo no esquema de segurança `apiToken`). Cada operação mostra o escopo",
                "exigido (`security` e `x-opex-required-scope`). Token ausente, inválido, revogado ou expirado → 401 `UNAUTHENTICATED`;",
                "token válido sem o escopo → 403 `INSUFFICIENT_SCOPE`. Token antigo, sem escopo gravado, acessa só as rotas livres.",
                ...(mcp
                    ? [
                          "",
                          "**MCP do Agente Maddox**: as ferramentas do Opex que o Maddox usa no OpenCode, nos servidores `opex_app` (dono) e",
                          "`opex_portal` (portal do cliente). Autenticam pelo segredo do MCP, que não sai do servidor. O servidor do dono também",
                          "aceita o token de sistema com o escopo `mcp:owner`: o `tools/list` devolve só as ferramentas do token. Cada ferramenta",
                          "tem o esquema de entrada em Schemas.",
                      ]
                    : []),
            ].join("\n"),
        },
        servers: [{ url: BASE_PATH || "/", description: "Mesmo host desta documentação (com o subcaminho público do app)" }],
        tags: [{ name: "Token", description: "Conferência do token de sistema." }, { name: "Agentes rotineiros", description: "Webhook externo dos agentes rotineiros (OPE-130)." }, ...(mcp?.tags ?? [])],
        paths: {
            "/api/v1/whoami": {
                get: {
                    operationId: "whoAmI",
                    tags: ["Token"],
                    summary: "Confere o token",
                    description: [
                        "Responde com o nome, o prefixo, os escopos e a expiração do token usado na chamada. Útil para validar a configuração de um cliente.",
                        "",
                        scopeSentence(publicRouteScope("/api/v1/whoami")),
                    ].join("\n"),
                    ...tokenOperationSecurity(publicRouteScope("/api/v1/whoami")),
                    responses: {
                        "200": {
                            description: "Token válido.",
                            content: jsonContent(ref("WhoAmIResponse"), {
                                success: true,
                                data: { token: { id: "66f0c0ffee0000000000abcd", nome: "Script de relatórios", prefixo: "mt_sys_AbCdEfGh", escopos: [API_SCOPE_ALL, MCP_OWNER_SCOPE, "mcp:owner:group:tasks"], legado: false, expiraEm: null } },
                            }),
                        },
                        "401": errorResponse("Token ausente, inválido, revogado ou expirado.", "Token ausente, inválido, revogado ou expirado", "UNAUTHENTICATED"),
                        ...(publicRouteScope("/api/v1/whoami") ? { "403": insufficientScopeResponse(publicRouteScope("/api/v1/whoami") as string) } : {}),
                    },
                },
            },
            "/api/v1/routine-agents/{id}/runs": {
                post: {
                    operationId: "triggerRoutineAgentRun",
                    tags: ["Agentes rotineiros"],
                    summary: "Dispara uma execução de um agente rotineiro",
                    description: [
                        "Webhook externo: cria uma execução **nova** do agente rotineiro (o webhook nunca reativa uma execução existente).",
                        "`request` e `payload` (opcionais) entram no contexto da execução; o `payload` serializado tem teto de 64 KB.",
                        "O gatilho \"Webhook externo\" do agente precisa estar ligado. Acompanhe a execução na página do agente (`/agentes-rotineiros/{id}`).",
                        "",
                        scopeSentence(ROUTINE_RUNS_SCOPE),
                    ].join("\n"),
                    ...tokenOperationSecurity(ROUTINE_RUNS_SCOPE),
                    parameters: [{ name: "id", in: "path", required: true, description: "Id do agente rotineiro (aparece na URL da página do agente).", schema: { type: "string", pattern: "^[a-f0-9]{24}$" } }],
                    requestBody: {
                        required: false,
                        content: jsonContent(ref("RoutineAgentRunBody"), { request: "Candidate-se às vagas novas de backend publicadas hoje", payload: { source: "rss", items: 3 } }),
                    },
                    responses: {
                        "201": { description: "Execução criada (na fila ou já executando).", content: jsonContent(ref("RoutineAgentRunResponse"), { success: true, data: { runId: "66f0c0ffee0000000000beef", status: "running" } }) },
                        "400": errorResponse("Corpo inválido ou `payload` acima de 64 KB.", "O payload passa de 64 KB (80 KB)", "PAYLOAD_TOO_LARGE"),
                        "401": errorResponse("Token ausente, inválido, revogado ou expirado.", "Token ausente, inválido, revogado ou expirado", "UNAUTHENTICATED"),
                        "403": insufficientScopeResponse(ROUTINE_RUNS_SCOPE),
                        "404": errorResponse("Agente rotineiro inexistente.", "Agente rotineiro não encontrado", "ROUTINE_AGENT_NOT_FOUND"),
                        "409": {
                            description: "Agente pausado ou arquivado (`ROUTINE_AGENT_PAUSED`), gatilho de webhook desligado (`ROUTINE_AGENT_WEBHOOK_DISABLED`) ou agente sem provisionamento (`ROUTINE_AGENT_NOT_PROVISIONED`).",
                            content: {
                                "application/json": {
                                    schema: ref("ApiError"),
                                    examples: {
                                        paused: { value: { success: false, error: "O agente rotineiro está pausado ou arquivado", code: "ROUTINE_AGENT_PAUSED" } },
                                        webhookDisabled: { value: { success: false, error: "O gatilho de webhook deste agente está desligado", code: "ROUTINE_AGENT_WEBHOOK_DISABLED" } },
                                        notProvisioned: { value: { success: false, error: "O agente rotineiro ainda não foi provisionado", code: "ROUTINE_AGENT_NOT_PROVISIONED" } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            ...(mcp?.paths ?? {}),
        },
        components: {
            securitySchemes: {
                [SECURITY_SCHEMES.apiToken]: {
                    type: "http",
                    scheme: "bearer",
                    description: [
                        "Token de sistema (`mt_sys_…`) gerado em Integrações › API interna, com escopos:",
                        "",
                        ...API_TOKEN_SCOPE_DOCS.map((item) => `- \`${item.scope}\` — ${item.description}`),
                        "",
                        `Ferramentas dos grupos ${MADDOX_TOKEN_EXCLUDED_GROUPS.join(", ")} só funcionam nas conversas do Maddox (indisponíveis por token).`,
                        "Token sem escopo gravado (legado) acessa só as rotas livres. Pelo menos um escopo por token; a expiração é opcional.",
                    ].join("\n"),
                },
                ...(mcp?.securitySchemes ?? {}),
            },
            schemas: {
                WhoAmIResponse: {
                    type: "object",
                    properties: { success: { const: true }, data: fromZod(whoAmIResponseSchema) },
                    required: ["success", "data"],
                },
                RoutineAgentRunBody: fromZod(routineWebhookBodySchema, "input"),
                RoutineAgentRunResponse: {
                    type: "object",
                    properties: { success: { const: true }, data: fromZod(routineWebhookResponseSchema) },
                    required: ["success", "data"],
                },
                ApiError: {
                    type: "object",
                    properties: { success: { const: false }, error: { type: "string" }, code: { type: "string" }, details: {} },
                    required: ["success", "error"],
                },
                ...(mcp?.schemas ?? {}),
            },
        },
    }
}
