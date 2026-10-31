import { toolErrorMessage } from "@/features/opex-agent/server/tools/define"
import { compactToolOutput } from "@/features/opex-agent/server/tool-display"
import { actorIdOf, sessionScopeOf, type OpexServerScope } from "@/features/opex-agent/server/scope"
import { getOpencodeClient } from "@/lib/ai/opencode-client"
import { dbConnect } from "@/lib/db"
import { OpexSession, type IOpexSession } from "@/lib/db/models/Opex"
import { loggerFor } from "@/lib/logger"
import type { MaddoxMcpScope } from "../constants"
import { JSON_RPC_ERRORS, MADDOX_MCP_REFUSALS, MCP_UNAUTHORIZED_CODE, handleMcpBody, mcpTextResult, OPENCODE_SESSION_META, type McpCallResult } from "../mcp-protocol"
import { maddoxMcpCatalog, toolDescriptor } from "./mcp-catalog"
import { isMaddoxMcpAuthorized } from "./opencode-session"
import { authorizeMaddoxTool } from "./scope-tools"
import { loadMaddoxSettings } from "./settings"

export { toolDescriptor, toolInputJsonSchema } from "./mcp-catalog"

/**
 * Servidor MCP do Opex para o Agente Maddox (SOMENTE servidor). O OpenCode chama `tools/call` com a
 * sessão que pediu (`_meta["ai.opencode/sessionID"]`); daí sai a sessão do Maddox e o escopo (dono ou
 * usuário do portal), reconstruído do banco e revalidado a cada chamada. A ferramenta chama o mesmo
 * serviço real do Agente Opex. Chamada de sessão desconhecida (outra sessão do OpenCode) é recusada.
 */

const log = loggerFor({ module: "maddox-mcp" })
/** Sessões filhas (subagentes do OpenCode) são resolvidas até a sessão do Maddox, até esta profundidade. */
const MAX_PARENT_DEPTH = 3

const catalogOf = maddoxMcpCatalog

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
    if (!opencodeSessionId) throw new McpAccessError(MADDOX_MCP_REFUSALS.noSession)
    const session = await maddoxSessionOfOpencode(opencodeSessionId)
    if (!session) throw new McpAccessError(MADDOX_MCP_REFUSALS.notMaddox)
    const isClient = Boolean(session.clientId)
    if ((scope === "portal") !== isClient) throw new McpAccessError(MADDOX_MCP_REFUSALS.wrongScope)
    const resolved = await sessionScopeOf(session)
    return { scope: { ...resolved, agent: "maddox" }, sessionId: session._id.toString() }
}

export async function callMaddoxTool(scope: MaddoxMcpScope, name: string, args: Record<string, unknown>, meta: Record<string, unknown>): Promise<McpCallResult> {
    const startedAt = Date.now()
    let sessionId: string | null = null
    try {
        const tool = (await catalogOf(scope)).find((item) => item.name === name)
        if (!tool) return mcpTextResult(MADDOX_MCP_REFUSALS.unknownTool(name), true)
        const call = await scopeOfCall(scope, meta)
        sessionId = call.sessionId
        const { settings } = await loadMaddoxSettings()
        if (!settings.enabled) throw new McpAccessError(MADDOX_MCP_REFUSALS.disabled)
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
        return Response.json({ jsonrpc: "2.0", id: null, error: { code: MCP_UNAUTHORIZED_CODE, message: MADDOX_MCP_REFUSALS.unauthorized } }, { status: 401 })
    }
    let body: unknown
    try {
        body = await req.json()
    } catch {
        return Response.json({ jsonrpc: "2.0", id: null, error: { code: JSON_RPC_ERRORS.parse, message: MADDOX_MCP_REFUSALS.invalidJson } }, { status: 400 })
    }
    const result = await handleMcpBody(body, {
        listTools: async () => (await catalogOf(scope)).map(toolDescriptor),
        callTool: (name, args, meta) => callMaddoxTool(scope, name, args, meta),
    })
    if (result === null) return new Response(null, { status: 202 })
    return Response.json(result)
}
