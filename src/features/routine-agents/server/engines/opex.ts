import { dynamicTool, isLoopFinished, streamText, type ModelMessage, type ToolSet } from "ai"
import { describeAiError, prepareModel, samplingOptions, type PreparedModel } from "@/lib/ai/stream"
import { toolErrorMessage, type OpexTool, type OpexToolContext } from "@/features/opex-agent/server/tools/define"
import { OWNER_SCOPE } from "@/features/opex-agent/server/scope"
import { compactToolOutput, redactToolInput, stringifyForDisplay } from "@/features/opex-agent/server/tool-display"
import { redactToolCalls } from "@/features/opex-agent/history"
import type { McpTurnTools } from "@/features/opex-agent/server/mcp/tools"
import { isRoutineForbiddenToolGroup } from "../../constants"
import { trimRoutineHistory } from "../../history"
import { TURN_ALREADY_CLOSED } from "../tools/guarded"
import { isInvalidRoutineOpexProvider, ROUTINE_ENGINE_PROVIDER_INVALID_MESSAGE } from "../../schemas"
import { routineLog } from "../shared"
import type { EngineInput, EngineResult } from "./types"
import { routineAgentTitle } from "../../identity-plan"

/**
 * Motor **Opex** (OPE-130): o mesmo pipeline do Agente Opex (`prepareModel` + `streamText` da AI SDK),
 * com o registro de ferramentas do Agente Opex filtrado pelas liberadas no agente, os MCPs cadastrados
 * liberados e as ferramentas internas. O `streamAi` não aceita ferramentas; por isso o loop é o do
 * Agente Opex.
 *
 * Decisão D4 do plano aprovado: com o switch de confirmação ligado, as ferramentas que já pedem
 * confirmação no Agente Opex (destrutivas, `confirmByDefault` e os ajustes "Pede confirmação" do dono
 * em Agente Opex › Ferramentas, mesclados com os dos MCPs como no runner do Agente Opex) são
 * **interceptadas** — a execução vai para Aguardando confirmação e a ação só roda depois que o dono
 * confirma. As ferramentas desligadas pelo dono no Agente Opex e os grupos proibidos aos rotineiros
 * (`ROUTINE_FORBIDDEN_TOOL_GROUPS`) ficam de fora, com aviso.
 */

const MAX_DETAIL = 400

export { TURN_ALREADY_CLOSED } from "../tools/guarded"

const parseHistory = (json: string | null | undefined): ModelMessage[] => {
    if (!json) return []
    try {
        const parsed = JSON.parse(json) as unknown
        return Array.isArray(parsed) ? (parsed as ModelMessage[]) : []
    } catch {
        return []
    }
}

/**
 * Ferramentas do app liberadas. As que sumiram do catálogo, as desligadas pelo dono no Agente Opex
 * (`enabledOpexTools`, mesmo critério do runner) e as de grupo proibido aos rotineiros viram aviso.
 */
export async function appToolsFor(names: readonly string[], disabledTools: readonly string[], warnings: string[]): Promise<OpexTool[]> {
    const { enabledOpexTools, findOpexTool } = await import("@/features/opex-agent/server/tools/registry")
    const enabled = new Set(enabledOpexTools(disabledTools).map((tool) => tool.name))
    const tools: OpexTool[] = []
    for (const name of names) {
        const tool = findOpexTool(name)
        if (!tool) warnings.push(`A ferramenta "${name}" foi liberada mas não existe mais no Opex: a execução segue sem ela.`)
        else if (isRoutineForbiddenToolGroup(tool.group)) warnings.push(`A ferramenta "${tool.label}" não pode ser usada por agentes rotineiros: a execução segue sem ela.`)
        else if (!enabled.has(name)) warnings.push(`A ferramenta "${tool.label}" está desligada no Agente Opex: a execução segue sem ela.`)
        else tools.push(tool)
    }
    return tools
}

async function mcpToolsFor(ids: readonly string[], signal: AbortSignal, warnings: string[]): Promise<McpTurnTools | null> {
    if (!ids.length) return null
    const { loadEnabledMcpServers } = await import("@/features/opex-agent/server/mcp/service")
    const present = new Set((await loadEnabledMcpServers(ids)).map((server) => server._id.toString()))
    for (const id of ids) if (!present.has(id)) warnings.push(`Um MCP liberado (${id}) foi removido ou desabilitado no Opex: a execução segue sem ele.`)
    if (!present.size) return null
    const { loadMcpTools } = await import("@/features/opex-agent/server/mcp/tools")
    const mcp = await loadMcpTools(OWNER_SCOPE, signal, { serverIds: [...present] })
    warnings.push(...mcp.notices)
    return mcp
}

export async function runOpexEngine(input: EngineInput): Promise<EngineResult> {
    const { agent, run, activation } = input
    const engine = run.snapshot.opex
    const signal = activation.controller.signal
    let prepared: PreparedModel | null = null
    let mcp: McpTurnTools | null = null
    let text = ""
    let errorMessage: string | null = null
    // Histórico das ativações anteriores, sem o raciocínio passado e dentro do orçamento (`history.ts`).
    // D9: snapshot gravado com um provedor que o motor Opex não aceita (ex.: `opencode`).
    if (isInvalidRoutineOpexProvider("opex", engine.provider)) return { error: ROUTINE_ENGINE_PROVIDER_INVALID_MESSAGE, text: "" }
    const history = trimRoutineHistory(parseHistory(run.messages))
    const userMessage: ModelMessage = { role: "user", content: input.message }
    try {
        const { needsConfirmation } = await import("@/features/opex-agent/server/tools/registry")
        const { loadOpexSettings } = await import("@/features/opex-agent/server/settings")
        const { settings } = await loadOpexSettings()
        const appTools = await appToolsFor(engine.enabledTools, settings.disabledTools, activation.warnings)
        mcp = await mcpToolsFor(engine.enabledMcpServers, signal, activation.warnings)
        const internalNames = new Set(input.internalTools.map((tool) => tool.name))
        const external = [...appTools, ...(mcp?.tools ?? [])].filter((tool) => !internalNames.has(tool.name))
        // Mesma política do runner do Agente Opex: ajustes dos MCPs, depois os do dono (que vencem).
        const overrides = { ...(mcp?.overrides ?? {}), ...settings.confirmationOverrides }
        const byName = new Map<string, OpexTool>([...external, ...input.internalTools].map((tool) => [tool.name, tool]))
        const context: OpexToolContext = { sessionId: "", actorId: "local", signal, scope: OWNER_SCOPE, secrets: activation.secrets }
        const tools: ToolSet = {}
        for (const def of byName.values()) {
            const internal = internalNames.has(def.name)
            tools[def.name] = dynamicTool({
                description: def.description,
                inputSchema: def.modelInputSchema ?? def.input,
                execute: async (raw: unknown, options) => {
                    const startedAt = Date.now()
                    // Outra ferramenta do mesmo passo já encerrou o turno: não executa nem sobrescreve a pendente.
                    if (activation.outcome !== null) {
                        input.onStep({ kind: "tool", label: `${def.label} (não executada: turno já encerrado)`, toolName: def.name, durationMs: 0 })
                        return TURN_ALREADY_CLOSED
                    }
                    try {
                        if (!internal && run.snapshot.confirmIrreversible && needsConfirmation(def, overrides)) {
                            const parsed = def.input.parse(raw)
                            activation.outcome = {
                                kind: "confirmation",
                                action: {
                                    summary: def.summarize?.(parsed) ?? `Executar "${def.label}"`,
                                    kind: "tool",
                                    toolName: def.name,
                                    toolLabel: def.label,
                                    input: JSON.stringify(raw ?? {}),
                                    displayInput: (stringifyForDisplay(redactToolInput(def, raw)) ?? "").slice(0, 4_000),
                                },
                            }
                            input.onStep({ kind: "tool", label: `${def.label} (aguardando confirmação)`, toolName: def.name, durationMs: 0 })
                            return { status: "confirmation_required", instruction: "A ação NÃO foi executada: aguarda a confirmação do dono. Encerre a resposta agora." }
                        }
                        const output = await def.execute(def.input.parse(raw), { ...context, signal: options.abortSignal ?? signal })
                        input.onStep({ kind: "tool", label: def.label, toolName: def.name, durationMs: Date.now() - startedAt, detail: internal ? null : (stringifyForDisplay(redactToolInput(def, raw)) ?? "").slice(0, MAX_DETAIL) })
                        return compactToolOutput(output)
                    } catch (error) {
                        const message = toolErrorMessage(error)
                        input.onStep({ kind: "tool", label: def.label, toolName: def.name, durationMs: Date.now() - startedAt, detail: message.slice(0, MAX_DETAIL), error: true })
                        throw new Error(message)
                    }
                },
            })
        }
        prepared = await prepareModel({ provider: engine.provider!, model: engine.model, variant: engine.variant, title: routineAgentTitle(agent.name) })
        const result = streamText({
            model: prepared.model,
            instructions: input.instructions(""),
            messages: [...history, userMessage],
            tools,
            stopWhen: [isLoopFinished(), () => activation.outcome !== null || activation.stopReason !== null],
            abortSignal: signal,
            providerOptions: prepared.providerOptions,
            ...(prepared.reasoning ? { reasoning: prepared.reasoning } : {}),
            ...samplingOptions({ provider: engine.provider!, variant: engine.variant }),
        })
        let step = 0
        let stepText = ""
        for await (const part of result.fullStream) {
            switch (part.type) {
                case "text-delta":
                    stepText += part.text ?? ""
                    break
                case "finish-step": {
                    step++
                    if (stepText.trim()) {
                        text = stepText.trim()
                        input.onStep({ kind: "text", label: "Resposta do agente", detail: text.slice(0, MAX_DETAIL) })
                    }
                    stepText = ""
                    const meta = part.providerMetadata?.opencode as { cost?: unknown } | undefined
                    const cost = typeof meta?.cost === "number" && Number.isFinite(meta.cost) ? meta.cost : null
                    const inputTokens = part.usage?.inputTokens ?? null
                    const outputTokens = part.usage?.outputTokens ?? null
                    const total = part.usage?.totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0)
                    input.onUsage({ tokens: total ?? 0, inputTokens, outputTokens, costUsd: cost, stepId: String(step), model: engine.model, provider: engine.provider! })
                    break
                }
                case "error":
                    errorMessage = describeAiError(part.error)
                    break
                case "finish":
                    if (part.finishReason === "error" && !errorMessage) errorMessage = "O modelo terminou com erro"
                    break
            }
        }
        if (stepText.trim()) text = stepText.trim()
        const response = redactToolCalls(await Promise.resolve(result.responseMessages).catch(() => []), (name, raw) => redactToolInput(byName.get(name), raw))
        return { error: errorMessage, text, messages: JSON.stringify(trimRoutineHistory([...history, userMessage, ...response])) }
    } catch (error) {
        if (signal.aborted) return { error: null, text, messages: JSON.stringify([...history, userMessage]) }
        const message = describeAiError(error)
        routineLog.warn({ runId: activation.runId, err: message }, "[routine-agents] falha no motor Opex")
        return { error: message, text, messages: JSON.stringify([...history, userMessage]) }
    } finally {
        await prepared?.dispose().catch(() => undefined)
        await mcp?.close().catch(() => undefined)
    }
}
