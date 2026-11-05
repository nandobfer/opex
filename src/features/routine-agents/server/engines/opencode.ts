import { createHash, randomBytes } from "node:crypto"
import { ROUTINE_TURN_TIMEOUT_MS } from "../../limits"
import { RoutineRun } from "@/lib/db/models/RoutineAgent"
import { liveWaitBudgetMs, remainingActiveMs } from "../../limits"
import { routineRunMcpName, routineRunMcpPath } from "../../constants"
import { messageOf, routineLog } from "../shared"
import type { EngineInput, EngineResult } from "./types"
import { routineAgentTitle } from "../../identity-plan"

/**
 * Motor **OpenCode no host** (OPE-130): a sessão abre na pasta do agente no host (persistente entre
 * execuções), com o agente e o modelo configurados. As ferramentas internas (memória, espera,
 * confirmação, conclusão) chegam ao OpenCode **por rede**, como um servidor MCP do Opex desta
 * execução (`/api/routine-agents/mcp/<runId>`), autenticado por um segredo aleatório da execução (só o
 * hash fica no banco). Servidor e host não compartilham disco.
 *
 * Os MCPs do `opencode.jsonc` que não foram liberados ficam negados pelas permissões da sessão. O
 * navegador para plataformas externas vem do MCP de navegador do host, quando liberado.
 */

const INSTRUCTIONS_KEY = "opex-rotineiro"
/** Depois de concluir/hibernar/pedir confirmação, quanto o turno pode demorar a encerrar sozinho. */
const STOP_GRACE_MS = 60_000
/** Turno sem limite de tempo ativo: teto técnico do OpenCode. */
const DEFAULT_TURN_TIMEOUT_MS = ROUTINE_TURN_TIMEOUT_MS

export const hashMcpSecret = (secret: string) => createHash("sha256").update(secret).digest("hex")

interface PermissionRule {
    action: string
    resource: string
    effect: "allow" | "deny" | "ask"
}

export function routineSessionPermissions(hostMcps: readonly string[], allowed: readonly string[], ownMcp: string): PermissionRule[] {
    const allow = new Set(allowed)
    const rules: PermissionRule[] = hostMcps.filter((name) => name !== ownMcp && !allow.has(name)).map((name) => ({ action: `${name}_*`, resource: "*", effect: "deny" }))
    rules.push({ action: `${ownMcp}_*`, resource: "*", effect: "allow" })
    return rules
}

export async function runOpencodeEngine(input: EngineInput): Promise<EngineResult> {
    const { agent, run, activation } = input
    const engine = run.snapshot.opencode
    const runId = String(run._id)
    const signal = activation.controller.signal
    const mcpName = routineRunMcpName(runId)
    let sessionId = run.opencodeSessionId ?? null
    let text = ""
    let directory: string | null = null
    const { getOpencodeClient } = await import("@/lib/ai/opencode-client")
    let client: Awaited<ReturnType<typeof getOpencodeClient>>
    try {
        client = await getOpencodeClient()
        const { ensureRoutineWorkdir } = await import("../workdir")
        directory = await ensureRoutineWorkdir(agent.slug)
    } catch (error) {
        return { error: `Serviço OpenCode indisponível: ${messageOf(error)}`, text, sessionId }
    }
    const location = { location: { directory } }
    try {
        const { opexPublicBaseUrl } = await import("@/features/ai/server/self-memory/mcp")
        const base = await opexPublicBaseUrl()
        if (!base) return { error: "Configure a URL pública do Opex (integração Engramind › Conexão) para o OpenCode alcançar as ferramentas do agente rotineiro", text, sessionId }
        const secret = randomBytes(32).toString("base64url")
        await RoutineRun.updateOne({ _id: run._id }, { $set: { mcp: { name: mcpName, secretHash: hashMcpSecret(secret) } } })
        const hostMcps = await client.mcp
            .list(location)
            .then((result) => result.data.map((server) => server.name))
            .catch(() => [] as string[])
        if (hostMcps.includes(mcpName)) await client.mcp.remove({ server: mcpName, ...location }).catch(() => undefined)
        await client.mcp.add({
            server: mcpName,
            ...location,
            config: { type: "remote", url: `${base}${routineRunMcpPath(runId)}`, headers: { Authorization: `Bearer ${secret}` }, oauth: false, timeout: { execution: liveWaitBudgetMs(run.snapshot.limits) + 120_000 } },
        })
        for (const name of engine.enabledMcps) if (!hostMcps.includes(name)) activation.warnings.push(`O MCP "${name}" foi liberado mas não existe mais no opencode.jsonc do host: a execução segue sem ele.`)
        const permissions = routineSessionPermissions(hostMcps, engine.enabledMcps, mcpName)
        if (sessionId) {
            const exists = await client.session
                .get({ sessionID: sessionId })
                .then(() => true)
                .catch(() => false)
            if (exists) await client.session.update({ sessionID: sessionId, permissions }).catch(() => undefined)
            else {
                activation.warnings.push("A sessão anterior do OpenCode não existe mais: a execução continuou numa sessão nova.")
                sessionId = null
            }
        }
        if (!sessionId) {
            const session = await client.session.create({ title: `${routineAgentTitle(agent.name)} #${run.seq}`, ...location, metadata: { app: "opex", kind: "routine-agent", runId }, permissions })
            sessionId = session.id
            await RoutineRun.updateOne({ _id: run._id }, { $set: { opencodeSessionId: sessionId } })
        }
        await client.session.instructions.entry.put({ sessionID: sessionId, key: INSTRUCTIONS_KEY, value: input.instructions(`${mcpName}_`) })
        const { runAgentTurn } = await import("@/lib/ai/opencode-run")
        let graceTimer: ReturnType<typeof setTimeout> | null = null
        const poll = setInterval(() => {
            if (activation.outcome && !graceTimer) graceTimer = setTimeout(() => activation.controller.abort("control"), STOP_GRACE_MS)
        }, 1_000)
        const remaining = remainingActiveMs({ activeMs: activation.baseActiveMs }, run.snapshot.limits)
        try {
            const result = await runAgentTurn(
                client,
                {
                    id: `routine:${runId}`,
                    sessionId,
                    stage: "Rotineiro",
                    title: routineAgentTitle(agent.name),
                    agent: { agent: engine.agent, model: engine.model, variant: engine.variant },
                    text: input.message,
                    timeoutMs: remaining === null ? DEFAULT_TURN_TIMEOUT_MS : Math.max(60_000, remaining + 60_000),
                    signal,
                    consumption: { origin: "routine-agent", subject: runId },
                },
                {
                    onText: (delta) => {
                        text += delta
                    },
                    onStep: (usage) => {
                        const tokens = usage.tokens.input + usage.tokens.output + usage.tokens.reasoning
                        input.onUsage({ tokens, inputTokens: usage.tokens.input, outputTokens: usage.tokens.output, costUsd: usage.costUsd, stepId: usage.stepId ?? String(Date.now()), model: engine.model, provider: "opencode", recorded: true })
                    },
                    publish: (event) => {
                        if (event.type === "tool" && event.state !== "running" && !event.name.startsWith(`${mcpName}_`)) input.onStep({ kind: "tool", label: event.name, toolName: event.name, detail: (event.error ?? event.input ?? null)?.slice(0, 400) ?? null, error: event.state === "error" })
                    },
                },
            )
            if (text.trim()) input.onStep({ kind: "text", label: "Resposta do agente", detail: text.trim().slice(0, 400) })
            if (result.outcome === "failed" && !activation.outcome) return { error: result.message ?? "O OpenCode encerrou a execução com erro", text: text.trim(), sessionId }
            return { error: null, text: text.trim(), sessionId }
        } finally {
            clearInterval(poll)
            if (graceTimer) clearTimeout(graceTimer)
        }
    } catch (error) {
        if (signal.aborted) return { error: null, text: text.trim(), sessionId }
        const message = messageOf(error)
        routineLog.warn({ runId, err: message }, "[routine-agents] falha no motor OpenCode")
        return { error: `OpenCode: ${message}`, text: text.trim(), sessionId }
    } finally {
        await client.mcp.remove({ server: mcpName, ...location }).catch(() => undefined)
    }
}
