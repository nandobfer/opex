/**
 * Servidor MCP mínimo (módulo PURO): JSON-RPC 2.0 do transporte "Streamable HTTP" **sem estado** e com
 * respostas JSON (sem SSE). Cobre o que o OpenCode usa para ferramentas: `initialize`,
 * `notifications/*`, `ping`, `tools/list` e `tools/call`. A rota decide autenticação e escopo.
 */

export const MCP_SERVER_INFO = { name: "opex", version: "1.0.0" } as const
/** Versão usada quando o cliente não informa a dele. */
export const MCP_DEFAULT_PROTOCOL_VERSION = "2025-06-18"

/** Metadado que o OpenCode envia em cada `tools/call` com a sessão que chamou. */
export const OPENCODE_SESSION_META = "ai.opencode/sessionID"

export interface McpToolDescriptor {
    name: string
    title?: string
    description: string
    inputSchema: Record<string, unknown>
    annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }
}

export interface McpCallResult {
    content: { type: "text"; text: string }[]
    isError?: boolean
}

export interface McpHandlers {
    listTools: () => Promise<McpToolDescriptor[]> | McpToolDescriptor[]
    callTool: (name: string, args: Record<string, unknown>, meta: Record<string, unknown>) => Promise<McpCallResult>
}

type JsonRpcId = string | number | null

export interface JsonRpcResponse {
    jsonrpc: "2.0"
    id: JsonRpcId
    result?: unknown
    error?: { code: number; message: string }
}

const isObj = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

export const JSON_RPC_ERRORS = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 } as const

function failure(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
    return { jsonrpc: "2.0", id, error: { code, message } }
}

/** Uma mensagem JSON-RPC → resposta (`null` para notificações, que não têm resposta). */
export async function handleMcpMessage(message: unknown, handlers: McpHandlers): Promise<JsonRpcResponse | null> {
    if (!isObj(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
        const id = isObj(message) && (typeof message.id === "string" || typeof message.id === "number") ? message.id : null
        return failure(id, JSON_RPC_ERRORS.invalidRequest, "Requisição JSON-RPC inválida")
    }
    const hasId = "id" in message && (typeof message.id === "string" || typeof message.id === "number")
    const id: JsonRpcId = hasId ? (message.id as string | number) : null
    if (!hasId) return null
    const params = isObj(message.params) ? message.params : {}
    switch (message.method) {
        case "initialize": {
            const requested = typeof params.protocolVersion === "string" && params.protocolVersion ? params.protocolVersion : MCP_DEFAULT_PROTOCOL_VERSION
            return { jsonrpc: "2.0", id, result: { protocolVersion: requested, capabilities: { tools: { listChanged: false } }, serverInfo: MCP_SERVER_INFO } }
        }
        case "ping":
            return { jsonrpc: "2.0", id, result: {} }
        case "tools/list":
            return { jsonrpc: "2.0", id, result: { tools: await handlers.listTools() } }
        case "tools/call": {
            if (typeof params.name !== "string" || !params.name) return failure(id, JSON_RPC_ERRORS.invalidParams, "Informe o nome da ferramenta")
            const args = isObj(params.arguments) ? params.arguments : {}
            const meta = isObj(params._meta) ? params._meta : {}
            try {
                return { jsonrpc: "2.0", id, result: await handlers.callTool(params.name, args, meta) }
            } catch (error) {
                return failure(id, JSON_RPC_ERRORS.internal, error instanceof Error ? error.message : String(error))
            }
        }
        default:
            return failure(id, JSON_RPC_ERRORS.methodNotFound, `Método não suportado: ${message.method}`)
    }
}

/** Corpo do POST (mensagem única ou lote) → respostas (vazio = só notificações → HTTP 202). */
export async function handleMcpBody(body: unknown, handlers: McpHandlers): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
    if (Array.isArray(body)) {
        const responses = (await Promise.all(body.map((item) => handleMcpMessage(item, handlers)))).filter((item): item is JsonRpcResponse => item !== null)
        return responses.length ? responses : null
    }
    return handleMcpMessage(body, handlers)
}

/** Resultado de ferramenta como texto (JSON indentado), com `isError` nas falhas. */
export function mcpTextResult(value: unknown, isError = false): McpCallResult {
    const text = typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "null")
    return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) }
}
