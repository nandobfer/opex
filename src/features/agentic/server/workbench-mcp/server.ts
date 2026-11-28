import { timingSafeEqual } from "node:crypto"
import { logger } from "@/lib/logger"
import { JSON_RPC_ERRORS, MCP_UNAUTHORIZED_CODE, OPENCODE_SESSION_META, handleMcpBody, mcpTextResult, type McpCallResult } from "@/features/maddox-agent/mcp-protocol"
import { workbenchMcpSecret } from "./register"
import { isWorkbenchMcpTool, runWorkbenchTool, workbenchToolDescriptors } from "./tools"
import { workbenchScopeOfSession } from "./scope"

/**
 * MCP "Mesa do Opex" (`opex_mesa`, OPE-178): servidor SOMENTE leitura com os dados da mesa (tarefa,
 * plano e versões, forks, anexos, PR e prévia) para o agente da mesa e dos forks. Registrado no OpenCode
 * por diretório (como o MCP de memórias), autenticado por um segredo derivado da chave das integrações
 * e com o escopo pela sessão do OpenCode que chamou. Não faz parte da API pública por token.
 */

export const WORKBENCH_MCP_REFUSALS = {
    noSession: "Chamada sem a sessão do OpenCode: as ferramentas da mesa só atendem o agente de uma mesa do Opex.",
    notWorkbench: "Esta sessão do OpenCode não é a conversa atual de uma mesa nem de um fork do Opex: ferramenta recusada.",
    unknownTool: (name: string) => `Ferramenta desconhecida: ${name}`,
} as const

export function isWorkbenchMcpAuthorized(authorization: string | null): boolean {
    const secret = workbenchMcpSecret()
    const received = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : ""
    if (!secret || !received) return false
    const a = Buffer.from(received)
    const b = Buffer.from(secret)
    return a.length === b.length && timingSafeEqual(a, b)
}

async function parentSession(sessionId: string): Promise<string | null> {
    const { getOpencodeClient } = await import("@nandobfer/integracoes/modules/integrations/ia/ai/opencode-client")
    const client = await getOpencodeClient()
    const info: { parentID?: string | null } | null = await client.session.get({ sessionID: sessionId }).catch(() => null)
    return info?.parentID ?? null
}

export async function callWorkbenchTool(name: string, args: Record<string, unknown>, meta: Record<string, unknown>): Promise<McpCallResult> {
    const startedAt = Date.now()
    const sessionId = typeof meta[OPENCODE_SESSION_META] === "string" ? (meta[OPENCODE_SESSION_META] as string) : null
    try {
        if (!isWorkbenchMcpTool(name)) return mcpTextResult(WORKBENCH_MCP_REFUSALS.unknownTool(name), true)
        if (!sessionId) return mcpTextResult(WORKBENCH_MCP_REFUSALS.noSession, true)
        const { dbConnect } = await import("@/lib/db")
        await dbConnect()
        const scope = await workbenchScopeOfSession(sessionId, parentSession)
        if (!scope) {
            logger.info({ tool: name, sessionId }, "[agentic] MCP da mesa recusou uma sessão desconhecida")
            return mcpTextResult(WORKBENCH_MCP_REFUSALS.notWorkbench, true)
        }
        const result = await runWorkbenchTool(name, args, scope)
        logger.info({ tool: name, workbenchId: String(scope.workbench._id), forkId: scope.fork ? String(scope.fork._id) : null, durationMs: Date.now() - startedAt, ok: !result.isError }, "[agentic] MCP da mesa")
        return result
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.warn({ tool: name, sessionId, durationMs: Date.now() - startedAt, err: message }, "[agentic] MCP da mesa falhou")
        return mcpTextResult(`Não foi possível ler os dados da mesa: ${message}`, true)
    }
}

const rpcError = (status: number, code: number, message: string) => Response.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status })

/** POST do transporte MCP (sem estado): autentica pelo segredo derivado e responde JSON. */
export async function handleWorkbenchMcpRequest(req: Request): Promise<Response> {
    if (!isWorkbenchMcpAuthorized(req.headers.get("authorization"))) {
        logger.warn("[agentic] chamada ao MCP da mesa sem autorização")
        return rpcError(401, MCP_UNAUTHORIZED_CODE, "Não autorizado")
    }
    let body: unknown
    try {
        body = await req.json()
    } catch {
        return rpcError(400, JSON_RPC_ERRORS.parse, "JSON inválido")
    }
    const result = await handleMcpBody(body, { listTools: () => workbenchToolDescriptors(), callTool: callWorkbenchTool })
    if (result === null) return new Response(null, { status: 202 })
    return Response.json(result)
}
