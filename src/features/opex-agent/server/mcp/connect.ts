import type { ListToolsResult, MCPClient } from "@ai-sdk/mcp"
import { OPEX_MCP_CONNECT_TIMEOUT_MS, type OpexMcpToolInfo, type OpexMcpTransport } from "../../mcp"

/**
 * Conexão com um MCP pela `@ai-sdk/mcp` (SOMENTE servidor; import sob demanda — o pacote é pesado e
 * só o turno do agente e o teste de conexão o usam).
 *
 * stdio: o processo roda DENTRO do servidor do Opex (container sem acesso ao host). O filho herda só
 * `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL` e `TERM` (regra da própria `@ai-sdk/mcp`) mais as
 * variáveis cadastradas — nunca as do Opex (banco, chave de criptografia…).
 */

export interface McpConnection {
    transport: OpexMcpTransport
    url: string
    command: string
    args: string[]
    headers: Record<string, string>
    env: Record<string, string>
}

const MAX_TOOL_PAGES = 10

export function describeMcpError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : ""
    return `${message || "Falha desconhecida"}${cause}`.slice(0, 500)
}

export async function connectMcp(connection: McpConnection, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<MCPClient> {
    const timeoutMs = options.timeoutMs ?? OPEX_MCP_CONNECT_TIMEOUT_MS[connection.transport]
    const { createMCPClient } = await import("@ai-sdk/mcp")
    const transport =
        connection.transport === "stdio"
            ? new (await import("@ai-sdk/mcp/mcp-stdio")).Experimental_StdioMCPTransport({ command: connection.command, args: connection.args, env: connection.env, stderr: "ignore" })
            : { type: connection.transport, url: connection.url, headers: connection.headers }
    const pending = createMCPClient({ transport, clientName: "opex", initializationOptions: { timeout: timeoutMs, ...(options.signal ? { signal: options.signal } : {}) } })
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Sem resposta em ${Math.round(timeoutMs / 1000)} s`)), timeoutMs)
    })
    try {
        return await Promise.race([pending, timeout])
    } catch (error) {
        // Conectou depois do limite: fecha para não deixar processo ou conexão pendurados.
        void pending.then((client) => client.close()).catch(() => undefined)
        throw error
    } finally {
        clearTimeout(timer)
    }
}

/** Todas as ferramentas do servidor (segue a paginação). */
export async function listMcpTools(client: MCPClient, signal?: AbortSignal): Promise<ListToolsResult> {
    let result = await client.listTools({ options: signal ? { signal } : {} })
    const tools = [...result.tools]
    for (let page = 1; result.nextCursor && page < MAX_TOOL_PAGES; page++) {
        result = await client.listTools({ params: { cursor: result.nextCursor }, options: signal ? { signal } : {} })
        tools.push(...result.tools)
    }
    return { ...result, tools, nextCursor: undefined }
}

/** Retrato enxuto exibido na tela (nome, título, descrição e anotações de risco). */
export function toolInfosOf(definitions: ListToolsResult): OpexMcpToolInfo[] {
    return definitions.tools.map((tool) => ({
        name: tool.name.slice(0, 200),
        title: (tool.title ?? tool.annotations?.title ?? null)?.slice(0, 200) ?? null,
        description: (tool.description ?? "").slice(0, 4000),
        annotations: {
            ...(typeof tool.annotations?.readOnlyHint === "boolean" ? { readOnlyHint: tool.annotations.readOnlyHint } : {}),
            ...(typeof tool.annotations?.destructiveHint === "boolean" ? { destructiveHint: tool.annotations.destructiveHint } : {}),
        },
    }))
}

export async function closeMcp(client: MCPClient | null | undefined): Promise<void> {
    await client?.close().catch(() => undefined)
}
