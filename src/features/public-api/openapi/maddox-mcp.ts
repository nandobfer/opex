import { MADDOX_MCP_SERVERS, maddoxMcpPath, type MaddoxMcpScope } from "@/features/maddox-agent/constants"
import { JSON_RPC_ERRORS, MADDOX_MCP_REFUSALS, MCP_DEFAULT_PROTOCOL_VERSION, MCP_SERVER_INFO, MCP_UNAUTHORIZED_CODE, OPENCODE_SESSION_META } from "@/features/maddox-agent/mcp-protocol"
import type { MaddoxMcpDocsCatalog, MaddoxMcpToolDoc } from "@/features/maddox-agent/server/mcp-catalog"
import { exampleFromJsonSchema } from "./json-schema-example"

/**
 * Seção OpenAPI do servidor MCP do Opex usado pelo Agente Maddox (módulo PURO). Gerada do MESMO
 * catálogo do `tools/list` (`maddoxMcpDocsCatalog`): ferramenta nova ou alterada aparece sozinha, sem
 * edição manual. Não são rotas por token de sistema: autenticam pelo segredo do MCP (`maddoxMcpSecret`).
 */

type JsonObject = Record<string, unknown>

export const MADDOX_MCP_SECURITY_SCHEME = "maddoxMcpSecret"

export const MADDOX_MCP_TAGS: Record<MaddoxMcpScope, string> = {
    owner: "MCP do Agente Maddox · dono",
    portal: "MCP do Agente Maddox · portal",
}

const SCOPE_LABEL: Record<MaddoxMcpScope, string> = { owner: "dono", portal: "portal do cliente" }
const SCHEMA_PREFIX: Record<MaddoxMcpScope, string> = { owner: "MaddoxOwnerTool", portal: "MaddoxPortalTool" }
const RISK_LABEL: Record<MaddoxMcpToolDoc["risk"], string> = { read: "leitura", write: "escrita", destructive: "destrutiva" }
const EXAMPLE_SESSION = "ses_0123456789abcdefghijklmn"

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const json = (schema: JsonObject, examples?: Record<string, { summary: string; value: unknown }>) => ({
    "application/json": { schema, ...(examples ? { examples } : {}) },
})

export const maddoxToolSchemaName = (scope: MaddoxMcpScope, tool: string) => `${SCHEMA_PREFIX[scope]}.${tool}`
const callSchemaName = (scope: MaddoxMcpScope, tool: string) => `${maddoxToolSchemaName(scope, tool)}.call`

/** Linha de uma ferramenta na lista do texto da operação. */
export function maddoxToolLine(tool: MaddoxMcpToolDoc): string {
    const flags = [tool.groupLabel, RISK_LABEL[tool.risk], tool.confirmsByDefault ? "pede confirmação" : null, tool.adminOnly ? "só admin" : null].filter(Boolean).join(" · ")
    return `• ${tool.opencodeName} (${tool.name}) — ${tool.title ?? tool.name} [${flags}]: ${tool.description}`
}

function operationDescription(scope: MaddoxMcpScope, tools: readonly MaddoxMcpToolDoc[]): string {
    return [
        `Servidor MCP "${MADDOX_MCP_SERVERS[scope]}" do Opex (${SCOPE_LABEL[scope]}), registrado sozinho no OpenCode para as conversas do Agente Maddox.`,
        "JSON-RPC 2.0 no transporte \"Streamable HTTP\" sem estado e com respostas JSON (sem SSE): initialize, ping, tools/list, tools/call e notificações (202). Aceita lote (array).",
        `Cada tools/call precisa de params._meta["${OPENCODE_SESSION_META}"] com a sessão do OpenCode: dela sai a conversa do Maddox e o escopo (${scope === "owner" ? "só conversas do dono" : "só conversas de usuários do portal, com cliente, vínculo, papel e ferramenta conferidos a cada chamada"}).`,
        "Recusas de escopo voltam como resultado com isError: true (veja os exemplos de resposta). Jobs agendados ficam fora do Maddox.",
        "O segredo não sai do servidor: pelo explorador, a chamada responde 401.",
        "",
        `Ferramentas (${tools.length}) — nome no OpenCode (nome no MCP) — título [grupo · risco · confirmação · admin]:`,
        ...tools.map(maddoxToolLine),
    ].join("\n")
}

function toolSchemas(scope: MaddoxMcpScope, tools: readonly MaddoxMcpToolDoc[]): Record<string, JsonObject> {
    const schemas: Record<string, JsonObject> = {}
    for (const tool of tools) {
        schemas[maddoxToolSchemaName(scope, tool.name)] = { ...tool.inputSchema, title: tool.title ?? tool.name, description: `${tool.opencodeName} — ${tool.description}` }
        schemas[callSchemaName(scope, tool.name)] = {
            type: "object",
            title: tool.name,
            properties: { name: { const: tool.name }, arguments: ref(maddoxToolSchemaName(scope, tool.name)), _meta: ref("McpCallMeta") },
            required: ["name", "arguments", "_meta"],
        }
    }
    const callName = `McpToolsCall.${scope}`
    schemas[callName] = {
        type: "object",
        title: "tools/call",
        properties: {
            jsonrpc: { const: "2.0" },
            id: ref("JsonRpcId"),
            method: { const: "tools/call" },
            params: {
                oneOf: tools.map((tool) => ref(callSchemaName(scope, tool.name))),
                discriminator: { propertyName: "name", mapping: Object.fromEntries(tools.map((tool) => [tool.name, `#/components/schemas/${callSchemaName(scope, tool.name)}`])) },
            },
        },
        required: ["jsonrpc", "id", "method", "params"],
    }
    schemas[`McpRequest.${scope}`] = {
        title: "Mensagem JSON-RPC",
        oneOf: [ref("McpInitializeRequest"), ref("McpPingRequest"), ref("McpToolsListRequest"), ref(callName), ref("McpNotification")],
    }
    return schemas
}

const rpc = (method: string, params?: JsonObject, id: number | null = 1) => ({ jsonrpc: "2.0", ...(id === null ? {} : { id }), method, ...(params ? { params } : {}) })

function requestExamples(tools: readonly MaddoxMcpToolDoc[]) {
    const examples: Record<string, { summary: string; value: unknown }> = {
        initialize: { summary: "initialize", value: rpc("initialize", { protocolVersion: MCP_DEFAULT_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "opencode", version: "2.0.0" } }) },
        "tools-list": { summary: "tools/list", value: rpc("tools/list", {}, 2) },
        ping: { summary: "ping", value: rpc("ping", undefined, 3) },
        notification: { summary: "notifications/initialized (202)", value: rpc("notifications/initialized", undefined, null) },
    }
    for (const tool of tools) {
        examples[`call-${tool.name}`] = {
            summary: `tools/call · ${tool.title ?? tool.name} (${tool.opencodeName})`,
            value: rpc("tools/call", { name: tool.name, arguments: exampleFromJsonSchema(tool.inputSchema) ?? {}, _meta: { [OPENCODE_SESSION_META]: EXAMPLE_SESSION } }, 4),
        }
    }
    return examples
}

function responseExamples(scope: MaddoxMcpScope, tools: readonly MaddoxMcpToolDoc[]) {
    const first = tools[0]
    const descriptor = first ? { name: first.name, title: first.title, description: first.description, inputSchema: first.inputSchema, annotations: first.annotations } : null
    return {
        initialize: { summary: "initialize", value: { jsonrpc: "2.0", id: 1, result: { protocolVersion: MCP_DEFAULT_PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: MCP_SERVER_INFO } } },
        "tools-list": { summary: `tools/list (${tools.length} ferramentas; a primeira abaixo)`, value: { jsonrpc: "2.0", id: 2, result: { tools: descriptor ? [descriptor] : [] } } },
        "call-ok": { summary: "tools/call executada (saída da ferramenta em JSON)", value: { jsonrpc: "2.0", id: 4, result: { content: [{ type: "text", text: '{\n  "ok": true\n}' }] } } },
        "call-no-session": { summary: "Recusa: sem a sessão do OpenCode", value: { jsonrpc: "2.0", id: 4, result: { content: [{ type: "text", text: MADDOX_MCP_REFUSALS.noSession }], isError: true } } },
        "call-not-maddox": { summary: "Recusa: sessão do OpenCode que não é do Maddox", value: { jsonrpc: "2.0", id: 4, result: { content: [{ type: "text", text: MADDOX_MCP_REFUSALS.notMaddox }], isError: true } } },
        "call-wrong-scope": { summary: `Recusa: conversa ${scope === "owner" ? "do portal" : "do dono"} neste servidor`, value: { jsonrpc: "2.0", id: 4, result: { content: [{ type: "text", text: MADDOX_MCP_REFUSALS.wrongScope }], isError: true } } },
        "call-disabled": { summary: "Recusa: Agente Maddox desativado", value: { jsonrpc: "2.0", id: 4, result: { content: [{ type: "text", text: MADDOX_MCP_REFUSALS.disabled }], isError: true } } },
        "call-tool-disabled": { summary: "Recusa: ferramenta desligada", value: { jsonrpc: "2.0", id: 4, result: { content: [{ type: "text", text: MADDOX_MCP_REFUSALS.toolDisabled }], isError: true } } },
        "call-unknown": { summary: "Ferramenta fora do catálogo", value: { jsonrpc: "2.0", id: 4, result: { content: [{ type: "text", text: MADDOX_MCP_REFUSALS.unknownTool("ferramenta_inexistente") }], isError: true } } },
        "method-not-found": { summary: "Método não suportado", value: { jsonrpc: "2.0", id: 5, error: { code: JSON_RPC_ERRORS.methodNotFound, message: "Método não suportado: resources/list" } } },
        "invalid-request": { summary: "Mensagem inválida", value: { jsonrpc: "2.0", id: null, error: { code: JSON_RPC_ERRORS.invalidRequest, message: "Requisição JSON-RPC inválida" } } },
    }
}

const errorBody = (code: number, message: string) => json(ref("JsonRpcResponse"), { erro: { summary: message, value: { jsonrpc: "2.0", id: null, error: { code, message } } } })

function operations(scope: MaddoxMcpScope, tools: readonly MaddoxMcpToolDoc[]): JsonObject {
    const security = [{ [MADDOX_MCP_SECURITY_SCHEME]: [] }]
    const notAllowed = (method: string) => ({
        operationId: `maddoxMcp${scope === "owner" ? "Owner" : "Portal"}${method}`,
        tags: [MADDOX_MCP_TAGS[scope]],
        summary: "Não suportado (transporte sem estado)",
        security,
        responses: { "405": { description: "Só POST (cabeçalho `Allow: POST`)." } },
    })
    return {
        post: {
            operationId: `maddoxMcp${scope === "owner" ? "Owner" : "Portal"}`,
            tags: [MADDOX_MCP_TAGS[scope]],
            summary: `Servidor MCP do Opex (${SCOPE_LABEL[scope]}) · ${tools.length} ferramentas`,
            description: operationDescription(scope, tools),
            security,
            requestBody: { required: true, content: json(ref(`McpRequest.${scope}`), requestExamples(tools)) },
            responses: {
                "200": { description: "Resposta JSON-RPC (resultado ou erro). Lote responde um array.", content: json(ref("JsonRpcResponse"), responseExamples(scope, tools)) },
                "202": { description: "Só notificações (sem corpo)." },
                "400": { description: "Corpo que não é JSON.", content: errorBody(JSON_RPC_ERRORS.parse, MADDOX_MCP_REFUSALS.invalidJson) },
                "401": { description: "Sem o segredo do MCP (o explorador não o tem).", content: errorBody(MCP_UNAUTHORIZED_CODE, MADDOX_MCP_REFUSALS.unauthorized) },
                "404": { description: "Servidor MCP desconhecido (só `owner` e `portal`)." },
            },
        },
        get: notAllowed("Get"),
        delete: notAllowed("Delete"),
    }
}

const COMMON_SCHEMAS: Record<string, JsonObject> = {
    JsonRpcId: { oneOf: [{ type: "string" }, { type: "integer" }], description: "Id da mensagem (notificações não têm)" },
    McpCallMeta: {
        type: "object",
        description: "Metadados que o OpenCode envia em cada chamada",
        properties: { [OPENCODE_SESSION_META]: { type: "string", description: "Sessão do OpenCode que chamou (a conversa do Maddox ou um subagente dela)", examples: [EXAMPLE_SESSION] } },
        required: [OPENCODE_SESSION_META],
    },
    McpInitializeRequest: {
        type: "object",
        title: "initialize",
        properties: { jsonrpc: { const: "2.0" }, id: ref("JsonRpcId"), method: { const: "initialize" }, params: { type: "object", properties: { protocolVersion: { type: "string", default: MCP_DEFAULT_PROTOCOL_VERSION } } } },
        required: ["jsonrpc", "id", "method"],
    },
    McpPingRequest: { type: "object", title: "ping", properties: { jsonrpc: { const: "2.0" }, id: ref("JsonRpcId"), method: { const: "ping" } }, required: ["jsonrpc", "id", "method"] },
    McpToolsListRequest: { type: "object", title: "tools/list", properties: { jsonrpc: { const: "2.0" }, id: ref("JsonRpcId"), method: { const: "tools/list" } }, required: ["jsonrpc", "id", "method"] },
    McpNotification: { type: "object", title: "notificação", description: "Sem `id`: responde 202 sem corpo", properties: { jsonrpc: { const: "2.0" }, method: { type: "string", examples: ["notifications/initialized"] } }, required: ["jsonrpc", "method"] },
    McpToolDescriptor: {
        type: "object",
        description: "Ferramenta devolvida pelo tools/list",
        properties: {
            name: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            inputSchema: { type: "object", description: "JSON Schema da entrada (o mesmo Zod da execução)" },
            annotations: { type: "object", properties: { readOnlyHint: { type: "boolean" }, destructiveHint: { type: "boolean" } } },
        },
        required: ["name", "description", "inputSchema"],
    },
    McpCallResult: {
        type: "object",
        description: "Resultado do tools/call: a saída da ferramenta em JSON (cortada com aviso acima de 30 mil caracteres)",
        properties: { content: { type: "array", items: { type: "object", properties: { type: { const: "text" }, text: { type: "string" } }, required: ["type", "text"] } }, isError: { type: "boolean" } },
        required: ["content"],
    },
    JsonRpcResponse: {
        type: "object",
        properties: {
            jsonrpc: { const: "2.0" },
            id: { oneOf: [ref("JsonRpcId"), { type: "null" }] },
            result: { description: "initialize / ping / tools/list ({ tools: McpToolDescriptor[] }) / tools/call (McpCallResult)" },
            error: { type: "object", properties: { code: { type: "integer" }, message: { type: "string" } }, required: ["code", "message"] },
        },
        required: ["jsonrpc", "id"],
    },
}

export interface MaddoxMcpSpecSection {
    tags: JsonObject[]
    paths: Record<string, JsonObject>
    schemas: Record<string, JsonObject>
    securitySchemes: Record<string, JsonObject>
}

export function buildMaddoxMcpSpecSection(catalog: MaddoxMcpDocsCatalog): MaddoxMcpSpecSection {
    const scopes: MaddoxMcpScope[] = ["owner", "portal"]
    return {
        tags: scopes.map((scope) => ({ name: MADDOX_MCP_TAGS[scope], description: `Ferramentas do Opex no OpenCode (${SCOPE_LABEL[scope]}): ${catalog[scope].length} ferramentas, prefixo ${MADDOX_MCP_SERVERS[scope]}_` })),
        paths: Object.fromEntries(scopes.map((scope) => [maddoxMcpPath(scope), operations(scope, catalog[scope])])),
        schemas: { ...COMMON_SCHEMAS, ...Object.assign({}, ...scopes.map((scope) => toolSchemas(scope, catalog[scope]))) },
        securitySchemes: {
            [MADDOX_MCP_SECURITY_SCHEME]: {
                type: "http",
                scheme: "bearer",
                description: "Segredo do MCP do Opex, derivado da chave das integrações e registrado sozinho no OpenCode (nunca exibido nem gravado). Não é o token de sistema.",
            },
        },
    }
}
