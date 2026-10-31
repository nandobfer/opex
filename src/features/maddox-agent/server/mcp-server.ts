import { API_TOKEN_PREFIX, authenticateApiToken, tokenLogRef } from "@/features/integrations/api-tokens/service"
import { MCP_OWNER_SCOPE, mcpOwnerToolDecision, type ScopeToolMeta, type ToolScopeRefusal } from "@/features/integrations/api-tokens/scopes"
import type { ApiTokenDto } from "@/features/integrations/api-tokens/types"
import { toolErrorMessage, type OpexTool } from "@/features/opex-agent/server/tools/define"
import { compactToolOutput } from "@/features/opex-agent/server/tool-display"
import { actorIdOf, OWNER_SCOPE, sessionScopeOf, type OpexServerScope } from "@/features/opex-agent/server/scope"
import { isAlwaysOnGroup } from "@/features/opex-agent/tool-tree"
import { getOpencodeClient } from "@/lib/ai/opencode-client"
import { dbConnect } from "@/lib/db"
import { OpexSession, type IOpexSession } from "@/lib/db/models/Opex"
import { loggerFor } from "@/lib/logger"
import type { MaddoxMcpScope } from "../constants"
import { enabledMaddoxOwnerToolNames } from "../catalog"
import { JSON_RPC_ERRORS, MADDOX_MCP_REFUSALS, MCP_FORBIDDEN_CODE, MCP_UNAUTHORIZED_CODE, handleMcpBody, mcpTextResult, OPENCODE_SESSION_META, type McpCallResult, type McpHandlers } from "../mcp-protocol"
import { maddoxMcpCatalog, toolDescriptor } from "./mcp-catalog"
import { isMaddoxMcpAuthorized } from "./opencode-session"
import { authorizeMaddoxTool } from "./scope-tools"
import { loadMaddoxSettings, maddoxToolMetas } from "./settings"

export { toolDescriptor, toolInputJsonSchema } from "./mcp-catalog"

/**
 * Servidor MCP do Opex para o Agente Maddox (SOMENTE servidor). O OpenCode chama `tools/call` com a
 * sessão que pediu (`_meta["ai.opencode/sessionID"]`); daí sai a sessão do Maddox e o escopo (dono ou
 * usuário do portal), reconstruído do banco e revalidado a cada chamada. A ferramenta chama o mesmo
 * serviço real do Agente Opex. Chamada de sessão desconhecida (outra sessão do OpenCode) é recusada.
 *
 * O servidor do dono também aceita um **token de sistema** (`Bearer mt_sys_…`) com o escopo `mcp:owner`:
 * sem sessão do OpenCode, o ator é o dono e as ferramentas são as cobertas pelo token (`tools/list`
 * filtrado, `tools/call` recusado fora do escopo; destrutivas só com `mcp:owner:destructive`). A
 * configuração do Maddox (ligado, ferramentas ligadas) é revalidada a cada chamada.
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

const tokenMetaOf = (tool: OpexTool): ScopeToolMeta => ({ name: tool.name, group: tool.group, risk: tool.risk, confirmByDefault: tool.confirmByDefault, alwaysOn: isAlwaysOnGroup(tool.group) })

const TOKEN_REFUSAL: Record<Exclude<ToolScopeRefusal, "no_mcp">, (name: string) => string> = {
    not_grantable: MADDOX_MCP_REFUSALS.tokenNotGrantable,
    not_granted: MADDOX_MCP_REFUSALS.tokenScope,
    destructive: MADDOX_MCP_REFUSALS.tokenDestructive,
}

/** Ferramentas ligadas no Maddox agora (vazio com o agente desativado). */
async function enabledOwnerTools(): Promise<{ enabled: boolean; names: Set<string> }> {
    const { settings } = await loadMaddoxSettings()
    if (!settings.enabled) return { enabled: false, names: new Set() }
    return { enabled: true, names: new Set(enabledMaddoxOwnerToolNames(await maddoxToolMetas(), settings.disabledTools)) }
}

/** `tools/list` de um token: só as ferramentas cobertas pelos escopos e ligadas no Maddox. */
export async function listMaddoxToolsForToken(token: ApiTokenDto) {
    const { names } = await enabledOwnerTools()
    return (await catalogOf("owner")).filter((tool) => names.has(tool.name) && mcpOwnerToolDecision(token.escopos, tokenMetaOf(tool)).ok).map(toolDescriptor)
}

/** `tools/call` de um token de sistema no MCP do dono: escopo do token, configuração do Maddox e execução como dono. */
export async function callMaddoxToolAsToken(token: ApiTokenDto, name: string, args: Record<string, unknown>): Promise<McpCallResult> {
    const startedAt = Date.now()
    const ref = tokenLogRef(token)
    try {
        const tool = (await catalogOf("owner")).find((item) => item.name === name)
        if (!tool) return mcpTextResult(MADDOX_MCP_REFUSALS.unknownTool(name), true)
        const decision = mcpOwnerToolDecision(token.escopos, tokenMetaOf(tool))
        if (!decision.ok) {
            log.warn({ ...ref, tool: name, deniedScope: decision.reason }, "[maddox] token de sistema sem escopo para a ferramenta")
            return mcpTextResult(decision.reason === "no_mcp" ? MADDOX_MCP_REFUSALS.tokenNoMcp : TOKEN_REFUSAL[decision.reason](name), true)
        }
        const { settings } = await loadMaddoxSettings()
        if (!settings.enabled) throw new McpAccessError(MADDOX_MCP_REFUSALS.disabled)
        const scope = await authorizeMaddoxTool(name, { ...OWNER_SCOPE, agent: "maddox" }, settings)
        const output = await tool.execute(tool.input.parse(args), {
            sessionId: "",
            actorId: actorIdOf(scope),
            scope,
            origin: { kind: "api-token", tokenId: token.id, nome: token.nome, prefixo: token.prefixo },
        })
        log.info({ ...ref, tool: name, scope: "owner", durationMs: Date.now() - startedAt, ok: true }, "[maddox] ferramenta do Opex por token de sistema")
        return mcpTextResult(compactToolOutput(output))
    } catch (error) {
        const message = error instanceof McpAccessError ? error.message : toolErrorMessage(error)
        log.info({ ...ref, tool: name, scope: "owner", durationMs: Date.now() - startedAt, ok: false, err: message }, "[maddox] ferramenta do Opex por token de sistema falhou")
        return mcpTextResult(message, true)
    }
}

const rpcError = (status: number, code: number, message: string) => Response.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status })

async function respond(req: Request, handlers: McpHandlers): Promise<Response> {
    let body: unknown
    try {
        body = await req.json()
    } catch {
        return rpcError(400, JSON_RPC_ERRORS.parse, MADDOX_MCP_REFUSALS.invalidJson)
    }
    const result = await handleMcpBody(body, handlers)
    if (result === null) return new Response(null, { status: 202 })
    return Response.json(result)
}

/** Chamada com token de sistema: 401 sem token válido, 403 no portal ou sem `mcp:owner`. */
async function handleTokenRequest(scope: MaddoxMcpScope, req: Request, authorization: string): Promise<Response> {
    const token = await authenticateApiToken(authorization)
    if (!token) {
        log.warn({ scope }, "[maddox] token de sistema inválido, revogado ou expirado no MCP do Opex")
        return rpcError(401, MCP_UNAUTHORIZED_CODE, MADDOX_MCP_REFUSALS.tokenUnauthorized)
    }
    if (scope === "portal") {
        log.warn({ ...tokenLogRef(token), scope, deniedScope: "mcp:portal" }, "[maddox] token de sistema recusado no MCP do portal")
        return rpcError(403, MCP_FORBIDDEN_CODE, MADDOX_MCP_REFUSALS.tokenPortal)
    }
    if (!token.escopos.includes(MCP_OWNER_SCOPE)) {
        log.warn({ ...tokenLogRef(token), scope, deniedScope: MCP_OWNER_SCOPE }, "[maddox] token de sistema sem o escopo do MCP do dono")
        return rpcError(403, MCP_FORBIDDEN_CODE, MADDOX_MCP_REFUSALS.tokenNoMcp)
    }
    return respond(req, {
        listTools: () => listMaddoxToolsForToken(token),
        callTool: (name, args) => callMaddoxToolAsToken(token, name, args),
    })
}

const bearerOf = (authorization: string | null) => (authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "")

/** POST do transporte MCP: autentica pelo segredo (ou token de sistema no dono), responde JSON (202 só para notificações). */
export async function handleMaddoxMcpRequest(scope: MaddoxMcpScope, req: Request): Promise<Response> {
    const authorization = req.headers.get("authorization")
    if (authorization && bearerOf(authorization).startsWith(API_TOKEN_PREFIX)) return handleTokenRequest(scope, req, authorization)
    if (!isMaddoxMcpAuthorized(authorization)) {
        log.warn({ scope }, "[maddox] chamada ao MCP do Opex sem autorização")
        return rpcError(401, MCP_UNAUTHORIZED_CODE, MADDOX_MCP_REFUSALS.unauthorized)
    }
    return respond(req, {
        listTools: async () => (await catalogOf(scope)).map(toolDescriptor),
        callTool: (name, args, meta) => callMaddoxTool(scope, name, args, meta),
    })
}
