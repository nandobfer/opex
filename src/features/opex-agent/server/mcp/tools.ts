import type { CallToolResult, ListToolsResult, MCPClient } from "@ai-sdk/mcp"
import { jsonSchema } from "ai"
import { z } from "zod"
import { loggerFor } from "@/lib/logger"
import { OPEX_MCP_CALL_TIMEOUT_MS, OPEX_MCP_TOOL_GROUP, cleanMcpInputSchema, isMcpToolName, mcpToolNames, mcpToolRisk } from "../../mcp"
import type { IOpexMcpServer } from "@/lib/db/models/Opex"
import { loadClientOpexConfig } from "../client-config"
import type { OpexServerScope } from "../scope"
import { OpexToolError, type OpexTool, type OpexToolContext } from "../tools/define"
import { closeMcp, connectMcp, describeMcpError, listMcpTools, toolInfosOf } from "./connect"
import { loadEnabledMcpServers, mcpConnectionOf, recordMcpStatus } from "./service"

/**
 * Ferramentas dos MCPs no turno do Agente Opex (SOMENTE servidor). Conecta em paralelo aos MCPs
 * habilitados (no portal, só os liberados para o cliente), converte cada ferramenta em `OpexTool`
 * (card, confirmação, redação e corte de saída das ferramentas do app) e fecha as conexões no fim do
 * turno. Um MCP que falha fica de fora do turno com um aviso: nunca derruba o agente.
 */

const log = loggerFor({ module: "opex-agent-mcp" })
const MAX_DESCRIPTION = 1000

type ServerDoc = IOpexMcpServer & { _id: { toString(): string } }

export interface McpTurnTools {
    tools: OpexTool[]
    /** Ajuste de "Pede confirmação" pelo nome da ferramenta no modelo. */
    overrides: Record<string, boolean>
    /** Avisos para o agente (MCP indisponível neste turno). */
    notices: string[]
    close: () => Promise<void>
}

const EMPTY: McpTurnTools = { tools: [], overrides: {}, notices: [], close: async () => undefined }

type ContentItem = Record<string, unknown> & { type?: unknown }

function contentOf(result: CallToolResult): ContentItem[] {
    const content = (result as { content?: unknown }).content
    return Array.isArray(content) ? (content as ContentItem[]) : []
}

const str = (value: unknown) => (typeof value === "string" ? value : "")

/** Conteúdo devolvido pelo MCP em formato enxuto para o modelo. */
export function mcpResultForModel(result: CallToolResult): unknown {
    if ("toolResult" in result) return result.toolResult
    const content = contentOf(result).map((item) => {
        switch (item.type) {
            case "text":
                return str(item.text)
            case "image":
            case "audio":
                return `[${item.type === "image" ? "imagem" : "áudio"} ${str(item.mimeType)} omitido]`
            case "resource": {
                const resource = (item.resource ?? {}) as Record<string, unknown>
                return typeof resource.text === "string" ? { uri: str(resource.uri), text: resource.text } : { uri: str(resource.uri), note: "conteúdo binário omitido" }
            }
            case "resource_link":
                return { uri: str(item.uri), name: str(item.name) }
            default:
                return item
        }
    })
    const structured = (result as { structuredContent?: unknown }).structuredContent
    if (structured !== undefined) return { structuredContent: structured, content }
    return content.length === 1 ? content[0] : content
}

function errorText(result: CallToolResult): string {
    const text = contentOf(result)
        .map((item) => (item.type === "text" ? str(item.text) : ""))
        .filter(Boolean)
        .join("\n")
    return text.slice(0, 2000) || "O MCP devolveu erro sem mensagem"
}

/** Converte as ferramentas de um MCP conectado em ferramentas do agente. */
export function mcpOpexTools(server: ServerDoc, client: MCPClient, definitions: ListToolsResult): { tools: OpexTool[]; overrides: Record<string, boolean> } {
    const id = server._id.toString()
    const names = mcpToolNames(
        server.slug,
        definitions.tools.map((tool) => tool.name),
    )
    const overrides: Record<string, boolean> = {}
    const tools = definitions.tools.map((definition): OpexTool => {
        const name = names.get(definition.name)!
        const risk = mcpToolRisk(definition.annotations)
        const confirm = server.confirmations?.[definition.name]
        if (typeof confirm === "boolean") overrides[name] = confirm
        const title = definition.title ?? definition.annotations?.title ?? definition.name
        return {
            name,
            group: OPEX_MCP_TOOL_GROUP,
            label: `${server.name} · ${title}`,
            description: `[MCP ${server.name}] ${definition.description ?? title}`.slice(0, MAX_DESCRIPTION),
            risk,
            // "Altera" pede confirmação por padrão; o ajuste da ferramenta no cadastro do MCP vence.
            ...(risk === "write" ? { confirmByDefault: true } : {}),
            mcpServerId: id,
            input: z.record(z.string(), z.unknown()) as z.ZodType<unknown>,
            modelInputSchema: jsonSchema(cleanMcpInputSchema(definition.inputSchema)),
            summarize: () => `Executar "${title}" no MCP ${server.name}`,
            execute: async (input: unknown, context: OpexToolContext) => {
                const startedAt = Date.now()
                const args = (input ?? {}) as Record<string, unknown>
                const base = { mcp: server.slug, tool: definition.name, sessionId: context.sessionId, scope: context.scope?.kind ?? "owner", inputChars: JSON.stringify(args).length }
                try {
                    const result = await client.callTool({ name: definition.name, arguments: args, options: { timeout: OPEX_MCP_CALL_TIMEOUT_MS, ...(context.signal ? { signal: context.signal } : {}) } })
                    if ((result as { isError?: boolean }).isError) throw new OpexToolError(`MCP ${server.name}: ${errorText(result)}`)
                    log.info({ ...base, durationMs: Date.now() - startedAt, ok: true }, "[opex-mcp] chamada de ferramenta")
                    return mcpResultForModel(result)
                } catch (error) {
                    const message = error instanceof OpexToolError ? error.message : `MCP ${server.name}: ${describeMcpError(error)}`
                    log.info({ ...base, durationMs: Date.now() - startedAt, ok: false, err: message }, "[opex-mcp] chamada de ferramenta")
                    throw new OpexToolError(message)
                }
            },
        }
    })
    return { tools, overrides }
}

/** MCPs que entram no turno: no dono, todos os habilitados; no portal, os liberados para o cliente. */
async function serversFor(scope: OpexServerScope): Promise<ServerDoc[]> {
    if (scope.kind === "owner") return loadEnabledMcpServers()
    const config = await loadClientOpexConfig(String(scope.actor.client._id))
    return loadEnabledMcpServers(config.enabledMcpServers)
}

interface Connected {
    server: ServerDoc
    client: MCPClient
    definitions: ListToolsResult
}

async function connectServer(server: ServerDoc, signal?: AbortSignal): Promise<Connected> {
    const client = await connectMcp(mcpConnectionOf(server), signal ? { signal } : {})
    try {
        return { server, client, definitions: await listMcpTools(client, signal) }
    } catch (error) {
        await closeMcp(client)
        throw error
    }
}

/** Conecta aos MCPs do turno; falhas viram avisos e ficam registradas na situação do MCP. */
export async function loadMcpTools(scope: OpexServerScope, signal?: AbortSignal): Promise<McpTurnTools> {
    const servers = await serversFor(scope).catch((error: unknown) => {
        log.warn({ err: error }, "[opex-mcp] falha ao ler os MCPs")
        return [] as ServerDoc[]
    })
    if (!servers.length) return EMPTY
    const settled = await Promise.allSettled(servers.map((server) => connectServer(server, signal)))
    const clients: MCPClient[] = []
    const tools: OpexTool[] = []
    const overrides: Record<string, boolean> = {}
    const notices: string[] = []
    const used = new Set<string>()
    settled.forEach((outcome, index) => {
        const server = servers[index]
        const id = server._id.toString()
        if (outcome.status === "rejected") {
            const message = describeMcpError(outcome.reason)
            log.warn({ mcp: server.slug, transport: server.transport, err: message }, "[opex-mcp] MCP indisponível no turno")
            notices.push(`MCP "${server.name}" indisponível neste turno (${message}); as ferramentas dele não estão disponíveis — avise o usuário se ele pedir algo desse MCP.`)
            void recordMcpStatus(id, { error: message })
            return
        }
        clients.push(outcome.value.client)
        void recordMcpStatus(id, { error: null, tools: toolInfosOf(outcome.value.definitions) })
        const converted = mcpOpexTools(server, outcome.value.client, outcome.value.definitions)
        for (const tool of converted.tools) {
            if (used.has(tool.name)) continue
            used.add(tool.name)
            tools.push(tool)
        }
        Object.assign(overrides, converted.overrides)
    })
    return { tools, overrides, notices, close: async () => void (await Promise.all(clients.map((client) => closeMcp(client)))) }
}

/**
 * Ferramenta de MCP para executar uma ação confirmada depois do turno: reconecta só aos MCPs cujo
 * prefixo bate com o nome e devolve a ferramenta e o `close`. `null` quando o MCP foi desabilitado,
 * excluído, deixou de estar liberado ao cliente ou não tem mais a ferramenta.
 */
export async function resolveMcpTool(name: string, scope: OpexServerScope): Promise<{ tool: OpexTool; close: () => Promise<void> } | null> {
    if (!isMcpToolName(name)) return null
    const candidates = (await serversFor(scope)).filter((server) => name.startsWith(`mcp_${server.slug}_`))
    for (const server of candidates) {
        const connected = await connectServer(server).catch((error: unknown) => {
            throw new OpexToolError(`MCP "${server.name}" indisponível: ${describeMcpError(error)}`)
        })
        const tool = mcpOpexTools(server, connected.client, connected.definitions).tools.find((item) => item.name === name)
        if (tool) return { tool, close: () => closeMcp(connected.client) }
        await closeMcp(connected.client)
    }
    return null
}

/** O MCP da ferramenta segue habilitado e (no portal) liberado ao cliente? */
export async function mcpServerAllowed(serverId: string, scope: OpexServerScope): Promise<boolean> {
    const servers = await serversFor(scope)
    return servers.some((server) => server._id.toString() === serverId)
}
