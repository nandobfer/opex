import { createHash, randomBytes } from "node:crypto"
import { ROUTINE_TURN_TIMEOUT_MS } from "../../limits"
import { RoutineRun } from "@/lib/db/models/RoutineAgent"
import { liveWaitBudgetMs, remainingActiveMs } from "../../limits"
import { routineRunMcpName, routineRunMcpPath } from "../../constants"
import { messageOf, routineLog } from "../shared"
import type { EngineInput, EngineResult } from "./types"
import { routineAgentTitle } from "../../identity-plan"
import { previewBaseUrl } from "@/lib/instance"
import { matchOpencodeSkill } from "@/lib/ai/opencode-skills"
import { listOpencodeSkillsAt } from "@/lib/ai/opencode-skill-list"

/**
 * Motor **OpenCode no host** (OPE-130): a sessão abre na pasta do agente no host (persistente entre
 * execuções), com o agente e o modelo configurados. As ferramentas internas (memória, espera,
 * confirmação, conclusão) chegam ao OpenCode **por rede**, como um servidor MCP do Opex desta
 * execução (`/api/routine-agents/mcp/<runId>`), autenticado por um segredo aleatório da execução (só o
 * hash fica no banco). Servidor e host não compartilham disco.
 *
 * Os MCPs do `opencode.jsonc` que não foram liberados ficam negados pelas permissões da sessão. O
 * navegador para plataformas externas vem do MCP de navegador do host, quando liberado.
 *
 * Retomada depois de um turno interrompido (OPE-147): a execução continua na MESMA sessão; se o turno
 * antigo ainda roda no host (instância que caiu sem fechar o turno), ele é interrompido antes. Numa
 * prévia do Opex, o MCP da execução aponta para a própria prévia (`OPEX_PREVIEW_URL`), que é onde o
 * turno vive.
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

/**
 * Skills do host (OPE-153): nega todas (`skill` + `*`, inclusive nativas, de projeto e as que surgirem) e
 * libera só as selecionadas que existem — a última regra que casa vence no OpenCode. Seleção por id ou nome
 * (`matchOpencodeSkill`); a regra usa sempre o id do OpenCode.
 */
export function routineSkillPermissions(hostSkills: readonly { id: string; name: string }[], allowed: readonly string[]): { rules: PermissionRule[]; missing: string[] } {
    const rules: PermissionRule[] = [{ action: "skill", resource: "*", effect: "deny" }]
    const granted = new Set<string>()
    const missing: string[] = []
    for (const name of allowed) {
        const skill = matchOpencodeSkill(name, hostSkills)
        if (!skill) {
            missing.push(name)
            continue
        }
        if (granted.has(skill.id)) continue
        granted.add(skill.id)
        rules.push({ action: "skill", resource: skill.id, effect: "allow" })
    }
    return { rules, missing }
}

/** Quanto a retomada espera o turno antigo da sessão parar depois de interrompê-lo. */
export const STALE_TURN_WAIT_MS = 15_000

type EngineClient = { session: { active?: () => Promise<unknown>; interrupt?: (input: { sessionID: string }) => Promise<unknown> } }

const isSessionActive = async (client: EngineClient, sessionId: string): Promise<boolean> => {
    if (typeof client.session.active !== "function") return false
    const active = await client.session.active().catch(() => null)
    return Boolean(active && (active as Record<string, unknown>)[sessionId])
}

/**
 * Turno antigo ainda ativo na sessão (a instância que o rodava caiu ou foi substituída): interrompe e
 * espera ele parar (com teto), para a retomada não disputar a sessão. Devolve se havia turno ativo.
 */
export async function interruptStaleTurn(client: EngineClient, sessionId: string, waitMs = STALE_TURN_WAIT_MS): Promise<boolean> {
    if (!(await isSessionActive(client, sessionId))) return false
    await client.session.interrupt?.({ sessionID: sessionId }).catch(() => undefined)
    const deadline = Date.now() + waitMs
    while (Date.now() < deadline && (await isSessionActive(client, sessionId))) await new Promise((resolve) => setTimeout(resolve, 500))
    return true
}

export async function runOpencodeEngine(input: EngineInput): Promise<EngineResult> {
    const { agent, run, activation } = input
    const engine = run.snapshot.opencode
    const runId = String(run._id)
    const signal = activation.controller.signal
    const mcpName = routineRunMcpName(runId)
    // Só a ativação dona da execução grava nela (OPE-147).
    const own = { _id: run._id, activationId: run.activationId ?? null }
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
        const base = previewBaseUrl() ?? (await opexPublicBaseUrl())
        if (!base) return { error: "Configure a URL pública do Opex (integração Engramind › Conexão) para o OpenCode alcançar as ferramentas do agente rotineiro", text, sessionId }
        const secret = randomBytes(32).toString("base64url")
        await RoutineRun.updateOne(own, { $set: { mcp: { name: mcpName, secretHash: hashMcpSecret(secret) } } })
        // Sem a lista, as permissões não negariam os MCPs não liberados: falha fechada, com erro acionável.
        let hostMcps: string[]
        try {
            hostMcps = (await client.mcp.list(location)).data.map((server) => server.name)
        } catch (error) {
            return { error: `Não foi possível listar os MCPs do host para aplicar as permissões da sessão: ${messageOf(error)}. Dispare de novo.`, text, sessionId }
        }
        // Skills do host: sem a lista, a seleção não teria como ser aplicada com segurança — falha fechada.
        let hostSkills: { id: string; name: string }[]
        try {
            // Diretório recém-aberto lista as skills aos poucos: espera as liberadas aparecerem (OPE-158).
            hostSkills = (await listOpencodeSkillsAt(client, directory, { want: engine.enabledSkills ?? [] })).skills.map((skill) => ({ id: skill.id, name: skill.name }))
        } catch (error) {
            return { error: `Não foi possível listar as skills do host para aplicar as permissões da sessão: ${messageOf(error)}. Confira o OpenCode e dispare de novo.`, text, sessionId }
        }
        const skills = routineSkillPermissions(hostSkills, engine.enabledSkills ?? [])
        for (const name of skills.missing) activation.warnings.push(`A skill "${name}" foi liberada mas não existe mais no OpenCode do host: a execução segue sem ela.`)
        if (hostMcps.includes(mcpName)) await client.mcp.remove({ server: mcpName, ...location }).catch(() => undefined)
        await client.mcp.add({
            server: mcpName,
            ...location,
            config: { type: "remote", url: `${base}${routineRunMcpPath(runId)}`, headers: { Authorization: `Bearer ${secret}` }, oauth: false, timeout: { execution: liveWaitBudgetMs(run.snapshot.limits) + 120_000 } },
        })
        for (const name of engine.enabledMcps) if (!hostMcps.includes(name)) activation.warnings.push(`O MCP "${name}" foi liberado mas não existe mais no opencode.jsonc do host: a execução segue sem ele.`)
        const permissions = [...routineSessionPermissions(hostMcps, engine.enabledMcps, mcpName), ...skills.rules]
        if (sessionId) {
            const exists = await client.session
                .get({ sessionID: sessionId })
                .then(() => true)
                .catch(() => false)
            // Sem atualizar as permissões, a sessão antiga seguiria com a lista desatualizada: abre uma nova.
            if (exists && (await interruptStaleTurn(client as unknown as EngineClient, sessionId))) routineLog.warn({ runId, sessionId }, "[routine-agents] turno antigo ainda ativo na sessão do OpenCode: interrompido antes da retomada")
            const updated = exists && (await client.session.update({ sessionID: sessionId, permissions }).then(() => true).catch(() => false))
            if (exists && !updated) {
                activation.warnings.push("Não foi possível atualizar as permissões da sessão anterior do OpenCode: a execução continuou numa sessão nova.")
                sessionId = null
            } else if (!exists) {
                activation.warnings.push("A sessão anterior do OpenCode não existe mais: a execução continuou numa sessão nova.")
                sessionId = null
            }
        }
        if (!sessionId) {
            const session = await client.session.create({ title: `${routineAgentTitle(agent.name)} #${run.seq}`, ...location, metadata: { app: "opex", kind: "routine-agent", runId }, permissions })
            sessionId = session.id
            await RoutineRun.updateOne(own, { $set: { opencodeSessionId: sessionId } })
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
        // Execução já retomada noutra ativação (este turno ficou para trás): o MCP é dela, não remove.
        const stillOwn = await Promise.resolve()
            .then(() => RoutineRun.countDocuments(own))
            .then((count) => count > 0, () => true)
        if (stillOwn) await client.mcp.remove({ server: mcpName, ...location }).catch(() => undefined)
    }
}
