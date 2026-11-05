import { timingSafeEqual } from "node:crypto"
import { JSON_RPC_ERRORS, MCP_UNAUTHORIZED_CODE, handleMcpBody, mcpTextResult } from "@/features/maddox-agent/mcp-protocol"
import { compactToolOutput } from "@/features/opex-agent/server/tool-display"
import { toolErrorMessage } from "@/features/opex-agent/server/tools/define"
import { RoutineRun } from "@/lib/db/models/RoutineAgent"
import { activationOf } from "./hub"
import { hashMcpSecret } from "./engines/opencode"
import { routineDb, routineLog } from "./shared"
import type { OpexTool } from "@/features/opex-agent/server/tools/define"

/**
 * Servidor MCP de uma execução (motor OpenCode, OPE-130): `POST /api/routine-agents/mcp/<runId>`, sem
 * sessão de navegador, autenticado pelo segredo aleatório da execução (só o hash fica no banco). Expõe
 * só as ferramentas internas (memória, espera, hibernação, confirmação, conclusão) do turno vivo e, com
 * "Chamadas HTTP com segredos" ligado, a `http_request` com os segredos do agente (a chamada sai do
 * servidor Opex; o OpenCode recebe só a resposta mascarada).
 */

const rpcError = (status: number, code: number, message: string) => Response.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status })

async function authorized(runId: string, authorization: string | null): Promise<boolean> {
    if (!authorization?.startsWith("Bearer ") || !/^[a-f0-9]{24}$/.test(runId)) return false
    await routineDb()
    const run = await RoutineRun.findById(runId).select({ mcp: 1, status: 1 }).lean()
    const expected = run?.mcp?.secretHash
    if (!expected || (run.status !== "running" && run.status !== "waiting")) return false
    const given = Buffer.from(hashMcpSecret(authorization.slice(7).trim()))
    const wanted = Buffer.from(expected)
    return given.length === wanted.length && timingSafeEqual(given, wanted)
}

export async function handleRoutineRunMcpRequest(runId: string, req: Request): Promise<Response> {
    if (!(await authorized(runId, req.headers.get("authorization")))) {
        routineLog.warn({ runId }, "[routine-agents] chamada ao MCP da execução sem autorização")
        return rpcError(401, MCP_UNAUTHORIZED_CODE, "Não autorizado")
    }
    let body: unknown
    try {
        body = await req.json()
    } catch {
        return rpcError(400, JSON_RPC_ERRORS.parse, "JSON inválido")
    }
    const { toolDescriptor } = await import("@/features/maddox-agent/server/mcp-catalog")
    const tools = (): OpexTool[] => activationOf(runId)?.tools ?? []
    const result = await handleMcpBody(body, {
        listTools: () => tools().map(toolDescriptor),
        callTool: async (name, args) => {
            const activation = activationOf(runId)
            const tool = tools().find((item) => item.name === name)
            if (!activation || !tool) return mcpTextResult({ error: "Ferramenta indisponível: a execução não tem turno ativo" }, true)
            try {
                const output = await tool.execute(tool.input.parse(args), { sessionId: "", actorId: "local", signal: activation.controller.signal, secrets: activation.secrets })
                return mcpTextResult(compactToolOutput(output))
            } catch (error) {
                return mcpTextResult({ error: toolErrorMessage(error) }, true)
            }
        },
    })
    if (result === null) return new Response(null, { status: 202 })
    return Response.json(result)
}
