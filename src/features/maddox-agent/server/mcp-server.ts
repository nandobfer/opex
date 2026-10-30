import { z } from "zod"
import type { OpexTool } from "@/features/opex-agent/server/tools/define"
import { toolErrorMessage } from "@/features/opex-agent/server/tools/define"
import { compactToolOutput } from "@/features/opex-agent/server/tool-runtime"
import { actorIdOf, sessionScopeOf, type OpexServerScope } from "@/features/opex-agent/server/scope"
import { getOpencodeClient } from "@/lib/ai/opencode-client"
import { dbConnect } from "@/lib/db"
import { OpexSession, type IOpexSession } from "@/lib/db/models/Opex"
import { loggerFor } from "@/lib/logger"
import { MADDOX_CLIENT_TOOL_NAMES, MADDOX_EXCLUDED_GROUPS } from "../catalog"
import type { MaddoxMcpScope } from "../constants"
import { handleMcpBody, mcpTextResult, OPENCODE_SESSION_META, type McpCallResult, type McpToolDescriptor } from "../mcp-protocol"
import { isMaddoxMcpAuthorized } from "./opencode-session"
import { authorizeMaddoxTool } from "./scope-tools"
import { loadMaddoxSettings } from "./settings"

/**
 * Servidor MCP do Opex para o Agente Maddox (SOMENTE servidor). O OpenCode chama `tools/call` com a
 * sessão que pediu (`_meta["ai.opencode/sessionID"]`); daí sai a sessão do Maddox e o escopo (dono ou
 * usuário do portal), reconstruído do banco e revalidado a cada chamada. A ferramenta chama o mesmo
 * serviço real do Agente Opex. Chamada de sessão desconhecida (outra sessão do OpenCode) é recusada.
 */

const log = loggerFor({ module: "maddox-mcp" })
/** Sessões filhas (subagentes do OpenCode) são resolvidas até a sessão do Maddox, até esta profundidade. */
const MAX_PARENT_DEPTH = 3

async function catalogOf(scope: MaddoxMcpScope): Promise<OpexTool[]> {
    if (scope === "owner") {
        const { OPEX_TOOLS } = await import("@/features/opex-agent/server/tools/registry")
        return OPEX_TOOLS.filter((tool) => !MADDOX_EXCLUDED_GROUPS.includes(tool.group))
    }
    const { OPEX_CLIENT_SERVER_TOOLS } = await import("@/features/opex-agent/server/client-tools/registry")
    return OPEX_CLIENT_SERVER_TOOLS.filter((tool) => MADDOX_CLIENT_TOOL_NAMES.includes(tool.name))
}

/** Esquema JSON da entrada (o mesmo Zod usado na execução). */
export function toolInputJsonSchema(tool: OpexTool): Record<string, unknown> {
    try {
        const schema = z.toJSONSchema(tool.input, { io: "input", unrepresentable: "any" }) as Record<string, unknown>
        const { $schema: _schema, ...rest } = schema
        void _schema
        return rest.type === "object" ? rest : { type: "object", properties: {} }
    } catch {
        return { type: "object", properties: {}, additionalProperties: true }
    }
}

export function toolDescriptor(tool: OpexTool): McpToolDescriptor {
    return {
        name: tool.name,
        title: tool.label,
        description: tool.description,
        inputSchema: toolInputJsonSchema(tool),
        annotations: { readOnlyHint: tool.risk === "read", destructiveHint: tool.risk === "destructive" },
    }
}

type MaddoxSessionDoc = IOpexSession & { _id: { toString(): string } }

/** Sessão do Maddox de uma sessão do OpenCode (ou da sessão-mãe, quando quem chama é um subagente). */
export async function maddoxSessionOfOpencode(opencodeSessionId: string): Promise<MaddoxSessionDoc | null> {
    await dbConnect()
    let current: string | null = opencodeSessionId
    for (let depth = 0; current && depth <= MAX_PARENT_DEPTH; depth++) {
        const doc: MaddoxSessionDoc | null = await OpexSession.findOne({ opencodeSessionId: current, agent: "maddox" }).lean<MaddoxSessionDoc>()
        if (doc) return doc
        const client = await getOpencodeClient()
        const info: { parentID?: string | null } | null = await client.session.get({ sessionID: current }).catch(() => null)
        current = info?.parentID ?? null
    }
    return null
}

class McpAccessError extends Error {}

/** Escopo da chamada: a sessão do Maddox existe, é do servidor chamado e o ator continua válido. */
async function scopeOfCall(scope: MaddoxMcpScope, meta: Record<string, unknown>): Promise<{ scope: OpexServerScope; sessionId: string }> {
    const opencodeSessionId = typeof meta[OPENCODE_SESSION_META] === "string" ? (meta[OPENCODE_SESSION_META] as string) : null
    if (!opencodeSessionId) throw new McpAccessError("Sessão do OpenCode não identificada: as ferramentas do Opex só funcionam nas conversas do Agente Maddox")
    const session = await maddoxSessionOfOpencode(opencodeSessionId)
    if (!session) throw new McpAccessError("Esta sessão do OpenCode não é uma conversa do Agente Maddox: ferramenta recusada")
    const isClient = Boolean(session.clientId)
    if ((scope === "portal") !== isClient) throw new McpAccessError("Ferramenta fora do escopo desta conversa")
    const resolved = await sessionScopeOf(session)
    return { scope: { ...resolved, agent: "maddox" }, sessionId: session._id.toString() }
}

export async function callMaddoxTool(scope: MaddoxMcpScope, name: string, args: Record<string, unknown>, meta: Record<string, unknown>): Promise<McpCallResult> {
    const startedAt = Date.now()
    let sessionId: string | null = null
    try {
        const tool = (await catalogOf(scope)).find((item) => item.name === name)
        if (!tool) return mcpTextResult(`Ferramenta desconhecida: ${name}`, true)
        const call = await scopeOfCall(scope, meta)
        sessionId = call.sessionId
        const { settings } = await loadMaddoxSettings()
        if (!settings.enabled) throw new McpAccessError("O Agente Maddox está desativado")
        const toolScope = await authorizeMaddoxTool(name, call.scope, settings)
        const output = await tool.execute(tool.input.parse(args), { sessionId: call.sessionId, actorId: actorIdOf(toolScope), scope: toolScope })
        log.info({ tool: name, sessionId, scope, durationMs: Date.now() - startedAt, ok: true }, "[maddox] ferramenta do Opex")
        return mcpTextResult(compactToolOutput(output))
    } catch (error) {
        const message = error instanceof McpAccessError ? error.message : toolErrorMessage(error)
        log.info({ tool: name, sessionId, scope, durationMs: Date.now() - startedAt, ok: false, err: message, inputSize: JSON.stringify(args).length }, "[maddox] ferramenta do Opex falhou")
        return mcpTextResult(message, true)
    }
}

/** POST do transporte MCP: autentica pelo segredo, responde JSON (202 só para notificações). */
export async function handleMaddoxMcpRequest(scope: MaddoxMcpScope, req: Request): Promise<Response> {
    if (!isMaddoxMcpAuthorized(req.headers.get("authorization"))) {
        log.warn({ scope }, "[maddox] chamada ao MCP do Opex sem autorização")
        return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Não autorizado" } }, { status: 401 })
    }
    let body: unknown
    try {
        body = await req.json()
    } catch {
        return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } }, { status: 400 })
    }
    const result = await handleMcpBody(body, {
        listTools: async () => (await catalogOf(scope)).map(toolDescriptor),
        callTool: (name, args, meta) => callMaddoxTool(scope, name, args, meta),
    })
    if (result === null) return new Response(null, { status: 202 })
    return Response.json(result)
}
