import { DomainError } from "@/lib/api/route"
import { routineIdentityOf } from "@/features/ai/agents"
import { OpexToolError, type OpexTool, type OpexToolContext } from "@/features/opex-agent/server/tools/define"
import type { OpexServerScope } from "@/features/opex-agent/server/scope"
import type { PreparedChatTurn, PrepareTurnInput, TurnModel } from "@/features/opex-agent/server/runner"
import { skillsCatalogBlock } from "@/features/opex-agent/skills"
import { HTTP_REQUEST_TOOL } from "@/features/opex-agent/server/tools/http"
import type { OpexProviderId } from "@/features/opex-agent/constants"
import { ROUTINE_CHAT_ENGINE_UNSUPPORTED_MESSAGE, ROUTINE_CHAT_STOP_GRACE_MS, ROUTINE_CHAT_TURN_TIMEOUT_MESSAGE, ROUTINE_CHAT_TURN_TIMEOUT_MS, routineChatInstructions } from "../../chat"
import { isRoutineForbiddenToolGroup } from "../../constants"
import { routineAgentTitle } from "../../identity-plan"
import { isInvalidRoutineOpexProvider, ROUTINE_ENGINE_PROVIDER_INVALID_MESSAGE, withRoutineEngineDefaults } from "../../schemas"
import { routineAgentTarget, routineMemoryChannels } from "../engramind"
import { loadRoutineSecretVault } from "../secrets"
import { loadAgentDoc, routineLog, type RoutineAgentDoc } from "../shared"
import { routineMemoryTools } from "../tools/memory"

/**
 * Turno da **conversa com um agente rotineiro** (OPE-160), montado para o runner do Agente Opex (que
 * cuida da sessão, do stream, da gravação e das confirmações). Carrega só o que é do agente: o modelo da
 * configuração atual (motor Opex), as ferramentas liberadas (menos as desligadas pelo dono no Agente Opex
 * e os grupos proibidos aos rotineiros), os MCPs liberados, as skills da seleção, a memória com o token
 * do agente e os segredos para a Chamada HTTP. **Nenhuma instrução** além do que o dono digita
 * (`routineChatInstructions`), e nada de execução: sem `routine_runs`, fila, vaga, limites nem as
 * ferramentas de controle (`finish`, `hibernate`, `wait`, `request_confirmation`).
 */

/** Escopo das sessões da conversa com um agente (sempre do dono). */
export function routineChatScope(agentId: string): OpexServerScope {
    return { kind: "owner", agent: "routine", routineAgentId: agentId }
}

function agentIdOf(scope: OpexServerScope): string {
    if (scope.agent !== "routine" || !scope.routineAgentId) throw new DomainError(404, "Agente rotineiro não encontrado", "ROUTINE_AGENT_NOT_FOUND")
    return scope.routineAgentId
}

/** Pode conversar? (ativo, motor Opex, provisionado e com provedor/modelo válidos). Devolve o modelo. */
export function assertRoutineChatAvailable(agent: RoutineAgentDoc): TurnModel {
    if (agent.status !== "active") throw new DomainError(409, "O agente rotineiro está pausado ou arquivado: retome-o para conversar", "ROUTINE_AGENT_PAUSED")
    if (agent.engine === "opencode") throw new DomainError(409, ROUTINE_CHAT_ENGINE_UNSUPPORTED_MESSAGE, "ROUTINE_CHAT_ENGINE_UNSUPPORTED")
    if (agent.provisioning?.status !== "ok") throw new DomainError(409, "O agente rotineiro ainda não foi provisionado (ou o provisionamento falhou): use \"Tentar de novo\" na configuração", "ROUTINE_AGENT_NOT_PROVISIONED")
    if (isInvalidRoutineOpexProvider(agent.engine, agent.opex?.provider)) throw new DomainError(409, ROUTINE_ENGINE_PROVIDER_INVALID_MESSAGE, "ROUTINE_ENGINE_PROVIDER_INVALID")
    const { opex } = withRoutineEngineDefaults(agent)
    if (!opex.provider || !opex.model) throw new DomainError(409, "Escolha o provedor e o modelo do agente em Configurar", "ROUTINE_CHAT_MODEL_MISSING")
    return { provider: opex.provider as OpexProviderId, model: opex.model, variant: opex.variant ?? null }
}

/** Modelo do turno (confere a disponibilidade antes de reservar a sessão). */
export async function routineChatTurnModel(scope: OpexServerScope): Promise<TurnModel> {
    return assertRoutineChatAvailable(await loadAgentDoc(agentIdOf(scope)))
}

/**
 * A ferramenta ainda vale para o agente? Conferido antes de cada chamada e antes de executar uma ação
 * confirmada (a configuração pode ter mudado): liberada no agente (ou de um MCP liberado), existente, fora
 * dos grupos proibidos e não desligada pelo dono no Agente Opex. Falha fechada.
 */
export async function assertRoutineChatToolAllowed(agentId: string, toolName: string, mcpServerId?: string | null): Promise<void> {
    const agent = await loadAgentDoc(agentId)
    assertRoutineChatAvailable(agent)
    const { opex } = withRoutineEngineDefaults(agent)
    if (mcpServerId) {
        if (!opex.enabledMcpServers.includes(mcpServerId)) throw new OpexToolError("O MCP desta ferramenta não está mais liberado para o agente rotineiro.")
        return
    }
    if (!opex.enabledTools.includes(toolName)) throw new OpexToolError("Esta ferramenta não está mais liberada para o agente rotineiro.")
    const [{ findOpexTool, enabledOpexTools }, { loadOpexSettings }] = await Promise.all([import("@/features/opex-agent/server/tools/registry"), import("@/features/opex-agent/server/settings")])
    const tool = findOpexTool(toolName)
    if (!tool || isRoutineForbiddenToolGroup(tool.group)) throw new OpexToolError("Esta ferramenta não pode ser usada pelo agente rotineiro.")
    const { settings } = await loadOpexSettings()
    if (!enabledOpexTools(settings.disabledTools).some((item) => item.name === toolName)) throw new OpexToolError("Esta ferramenta está desligada no Agente Opex.")
}

/** Segredos do agente para executar uma ação confirmada na conversa (Chamada HTTP com `{{secret:…}}`). */
export async function routineChatSecrets(scope: OpexServerScope): Promise<OpexToolContext["secrets"]> {
    return loadRoutineSecretVault(agentIdOf(scope))
}

export async function prepareRoutineChatTurn(input: PrepareTurnInput): Promise<PreparedChatTurn> {
    const agentId = agentIdOf(input.scope)
    const agent = await loadAgentDoc(agentId)
    assertRoutineChatAvailable(agent)
    const engine = withRoutineEngineDefaults(agent).opex
    const { loadSession } = await import("@/features/opex-agent/server/sessions")
    const session = await loadSession(input.sessionId, input.scope)
    const notices: string[] = []
    const target = await routineAgentTarget(agent.engramindToken).catch(() => null)
    if (!target) throw new Error("Token do agente rotineiro indisponível no Engramind: use \"Reprovisionar\" na configuração do agente")
    const { channels, memoryChannels } = await routineMemoryChannels(
        agent,
        target,
        (message) => notices.push(message),
        (error) => routineLog.warn({ err: error, sessionId: input.sessionId }, "[routine-agents] conversa: não foi possível conferir os canais arquivados"),
    )
    const { getAgentMemoryContext } = await import("@/features/engramind/server/memory-context")
    const memory = await getAgentMemoryContext(routineIdentityOf(agent.slug), channels, { target, focus: input.userText.slice(0, 1_000) })
    if (memory.source === "none" && memory.reason) throw new Error(`Engramind indisponível (${memory.reason}). Confira a integração Engramind e envie de novo.`)
    if (memory.source === "cache") notices.push("Engramind indisponível: a resposta usou o último contexto de memórias em cache.")

    const [{ loadOpexSettings }, { needsConfirmation }, { appToolsFor, mcpToolsFor }, { routineSkillsForRun }, { loadSessionHistory }] = await Promise.all([
        import("@/features/opex-agent/server/settings"),
        import("@/features/opex-agent/server/tools/registry"),
        import("../engines/opex"),
        import("@/features/opex-agent/server/skills/turn"),
        import("@/features/opex-agent/server/turn-history"),
    ])
    const { settings } = await loadOpexSettings()
    const appTools = await appToolsFor(engine.enabledTools, settings.disabledTools, notices)
    const mcp = await mcpToolsFor(engine.enabledMcpServers, input.signal, notices)
    try {
        const skills = await routineSkillsForRun(engine.enabledSkills ?? [])
        if (skills.missing.length) notices.push(`Skill indisponível (removida do Agente Opex), fora desta conversa: ${skills.missing.join(", ")}.`)
        const memoryTools = routineMemoryTools({
            slug: agent.slug,
            label: `${routineAgentTitle(agent.name)} · conversa`,
            target,
            runId: "",
            sessionId: input.sessionId,
            allowed: memoryChannels,
            warn: (message) => routineLog.warn({ sessionId: input.sessionId }, `[routine-agents] conversa: ${message}`),
        })
        const internal: OpexTool[] = [...memoryTools, ...skills.tools]
        const internalNames = new Set(internal.map((tool) => tool.name))
        const external = [...appTools, ...(mcp?.tools ?? [])].filter((tool) => !internalNames.has(tool.name))
        // Mesma política do motor Opex dos rotineiros: ajustes dos MCPs, depois os do dono (que vencem).
        const overrides = { ...(mcp?.overrides ?? {}), ...settings.confirmationOverrides }
        const secrets = await loadRoutineSecretVault(agent._id)
        const http = appTools.some((tool) => tool.name === HTTP_REQUEST_TOOL)
        const history = await loadSessionHistory(input.sessionId, session.summary, input.model.provider, input.model.model, { signal: input.signal, turnContext: false })
        const confirmIrreversible = agent.confirmIrreversible !== false
        const tools = [...external, ...internal]
        return {
            tools,
            overrides,
            lookup: new Map(tools.map((tool) => [tool.name, tool])),
            instructions: routineChatInstructions({ memoryBlock: memory.block, skillsBlock: skillsCatalogBlock(skills.catalog), secrets: http ? secrets.list() : null }),
            history,
            toolContext: { sessionId: input.sessionId, actorId: input.actorId, signal: input.signal, scope: input.scope, secrets },
            notices,
            hooks: {
                // Internas (memória, skills) nunca pedem confirmação; as demais seguem o switch do agente (D4).
                shouldConfirm: (tool) => !internalNames.has(tool.name) && confirmIrreversible && needsConfirmation(tool, overrides),
                authorize: async (tool) => {
                    if (!internalNames.has(tool.name)) await assertRoutineChatToolAllowed(agentId, tool.name, tool.mcpServerId)
                },
            },
            providerSession: `opex-routine-chat-${input.sessionId}`,
            title: routineAgentTitle(agent.name),
            timeout: { ms: ROUTINE_CHAT_TURN_TIMEOUT_MS, message: ROUTINE_CHAT_TURN_TIMEOUT_MESSAGE, graceMs: ROUTINE_CHAT_STOP_GRACE_MS },
            close: async () => {
                await mcp?.close()
            },
        }
    } catch (error) {
        await mcp?.close().catch(() => undefined)
        throw error
    }
}
