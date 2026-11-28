import { Types } from "mongoose"
import type { IAgentFileOrigin } from "@/lib/db/models/AgentFile"
import type { OpexToolContext } from "@/features/opex-agent/server/tools/define"

/**
 * Origem de um arquivo dos agentes (OPE-210) a partir do contexto da ferramenta: agente rotineiro (com a
 * execução), token de sistema no MCP do dono, sessão do Agente Opex/Maddox ou o próprio app.
 */
export async function originOf(context: Pick<OpexToolContext, "routine" | "origin" | "sessionId">, tool: string): Promise<IAgentFileOrigin> {
    if (context.routine) {
        const { RoutineAgent } = await import("@/lib/db/models/RoutineAgent")
        const agent = Types.ObjectId.isValid(context.routine.agentId) ? await RoutineAgent.findById(context.routine.agentId).select({ name: 1 }).lean() : null
        return { type: "routine", agentId: context.routine.agentId, agentName: agent?.name ?? null, runId: context.routine.runId, sessionId: context.sessionId || null, tool }
    }
    if (context.origin?.kind === "api-token") return { type: "api-token", tokenId: context.origin.tokenId, agentName: context.origin.nome, tool }
    if (context.sessionId && Types.ObjectId.isValid(context.sessionId)) {
        const { OpexSession } = await import("@/lib/db/models/Opex")
        const session = await OpexSession.findById(context.sessionId).select({ agent: 1 }).lean()
        const type = session?.agent === "maddox" ? "maddox" : "opex"
        return { type, agentName: type === "maddox" ? "Agente Maddox" : "Agente Opex", sessionId: context.sessionId, tool }
    }
    return { type: "app", tool }
}
