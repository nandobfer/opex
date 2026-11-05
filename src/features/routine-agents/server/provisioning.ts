import { ensureMemoryChannel, ensureAppToken } from "@/features/engramind/server/memory-network"
import { engramindTarget, type EngramindTarget } from "@/features/engramind/server/client"
import { AI_AGENTS, memoryChannelName } from "@/features/ai/agents"
import { RoutineAgent, type IRoutineProvisioning } from "@/lib/db/models/RoutineAgent"
import { ROUTINE_GLOBAL_CHANNEL, ROUTINE_PROVISIONING_ORIGIN, routineChannelOf } from "../constants"
import { EXTRA_CHANNELS_INSTRUCTIONS, extraChannelPrompt, parseExtraChannelPlan } from "../provision-plan"
import { baseRoutineChannels, ensureRoutineEngramindAgent, ensureRoutineSubscriptions, ensureRoutineToken, listEngramindChannels } from "./engramind"
import { loadRoutineAgentSettings } from "./settings"
import { AcaoAuditoria, auditAgent, loadAgentDoc, messageOf, publishAgentUpdated, routineLog, type RoutineAgentDoc } from "./shared"

/**
 * Subagente de provisionamento (OPE-130). Roda sozinho ao criar o agente (e em "Tentar de novo" /
 * "Reprovisionar"), sem pedir aprovação, e aplica tudo:
 * 1. cadastra o agente no Engramind (`opex/rotineiro-<slug>`, pelo token de app);
 * 2. emite o token do agente e o guarda **cifrado** no documento do agente;
 * 3. cria o canal próprio (e o global dos rotineiros) e assina `opex`, o global e o próprio;
 * 4. lê o objetivo e as instruções e decide os canais extras com o modelo configurado (D2): assina
 *    os existentes adequados e cria os novos;
 * 5. no motor OpenCode, cria a pasta de trabalho no host.
 *
 * Cada passo é idempotente e marca `steps.*`: "Tentar de novo" retoma o que faltou sem duplicar.
 * "Reprovisionar" refaz só os extras e **acrescenta** — nunca remove os canais base nem os extras já
 * assinados. Falha → `provisioning.status = "error"` com a mensagem (o agente não executa).
 */

export type ProvisionMode = "create" | "retry" | "reprovision"

const globalRegistry = globalThis as unknown as { __routineProvisioning?: Map<string, Promise<void>> }
const inFlight = (globalRegistry.__routineProvisioning ??= new Map())

const NO_MODEL_MESSAGE = "Configure o modelo do provisionamento (Integrações › Inteligência Artificial › Rotineiros)"

/** Dispara o provisionamento em segundo plano (deduplicado por agente). Nunca rejeita. */
export function startProvisioning(agentId: string, mode: ProvisionMode, actorId: string): Promise<void> {
    const current = inFlight.get(agentId)
    if (current) return current
    const run = provisionRoutineAgent(agentId, mode, actorId)
        .catch((error: unknown) => routineLog.warn({ agentId, err: messageOf(error) }, "[routine-agents] provisionamento falhou fora do fluxo"))
        .finally(() => inFlight.delete(agentId))
    inFlight.set(agentId, run)
    return run
}

async function save(agentId: string, provisioning: IRoutineProvisioning, extra: Record<string, unknown> = {}): Promise<void> {
    await RoutineAgent.updateOne({ _id: agentId }, { $set: { provisioning, ...extra } })
    await publishAgentUpdated(agentId)
}

/** Texto completo do subagente (uma chamada, resposta JSON). */
async function askPlanner(doc: RoutineAgentDoc, prompt: string): Promise<string> {
    const settings = await loadRoutineAgentSettings()
    if (!settings.provider || !settings.model) throw new Error(NO_MODEL_MESSAGE)
    const { streamAi } = await import("@/lib/ai/stream")
    let text = ""
    for await (const event of streamAi({
        provider: settings.provider,
        model: settings.model,
        variant: settings.variant,
        agent: settings.agent,
        instructions: EXTRA_CHANNELS_INSTRUCTIONS,
        prompt,
        title: `Provisionamento · ${doc.name}`,
        consumption: { origin: ROUTINE_PROVISIONING_ORIGIN, subject: String(doc._id) },
    })) {
        if (event.type === "delta") text += event.text
        if (event.type === "error") throw new Error(event.message)
    }
    return text
}

export async function provisionRoutineAgent(agentId: string, mode: ProvisionMode, actorId: string): Promise<void> {
    const doc = await loadAgentDoc(agentId)
    const state: IRoutineProvisioning = {
        status: "running",
        error: null,
        at: new Date(),
        steps: { ...(doc.provisioning?.steps ?? { agent: false, token: false, channels: false, extras: false, workdir: false }) },
        channels: doc.provisioning?.channels ?? [],
        extras: doc.provisioning?.extras ?? [],
        warnings: [],
    }
    await save(agentId, state)
    const created: string[] = []
    try {
        let admin: EngramindTarget
        try {
            admin = await engramindTarget()
        } catch (error) {
            throw new Error(`Engramind indisponível: ${messageOf(error)}. Confira a integração Engramind e tente de novo.`)
        }
        const app = (await ensureAppToken(admin, actorId, state.warnings)) ?? admin

        await ensureRoutineEngramindAgent(doc.slug, doc.name, doc.objective, app)
        state.steps.agent = true

        const { token, issued } = await ensureRoutineToken(doc.slug, doc.engramindToken ?? null, app)
        state.steps.token = true
        // O token só vai para o banco (cifrado); a auditoria leva o prefixo.
        await RoutineAgent.updateOne({ _id: agentId }, { $set: { engramindToken: token } })

        await ensureMemoryChannel(ROUTINE_GLOBAL_CHANNEL, memoryChannelName("routine-global"), AI_AGENTS["routine-global"].description, admin)
        if ((await ensureMemoryChannel(routineChannelOf(doc.slug), memoryChannelName("routine-specific", doc.name), AI_AGENTS["routine-specific"].description, admin)) === "created") created.push(routineChannelOf(doc.slug))
        await ensureRoutineSubscriptions(doc.slug, baseRoutineChannels(doc.slug), app)
        state.steps.channels = true
        state.channels = baseRoutineChannels(doc.slug)

        if (!state.steps.extras || mode === "reprovision") {
            const channels = await listEngramindChannels(admin)
            const known = new Set(channels.map((channel) => channel.slug))
            const answer = await askPlanner(doc, extraChannelPrompt(doc, channels, state.extras.map((item) => item.channel)))
            const plan = parseExtraChannelPlan(answer, channels, state.extras.map((item) => item.channel))
            state.warnings.push(...plan.warnings)
            for (const item of plan.items) {
                // Slug que já existe (ou passou a existir) é assinatura, nunca recriação.
                const outcome = known.has(item.channel) ? "exists" : await ensureMemoryChannel(item.channel, item.name, item.description || item.reason, admin)
                if (outcome === "created") created.push(item.channel)
                state.extras.push({ channel: item.channel, name: item.name, reason: item.reason, created: outcome === "created" })
            }
            await ensureRoutineSubscriptions(
                doc.slug,
                state.extras.map((item) => item.channel),
                app,
            )
            state.steps.extras = true
        }

        if (doc.engine === "opencode") {
            const { ensureRoutineWorkdir } = await import("./workdir")
            const workdir = await ensureRoutineWorkdir(doc.slug)
            state.steps.workdir = true
            await RoutineAgent.updateOne({ _id: agentId }, { $set: { workdir } })
        } else state.steps.workdir = true

        state.status = "ok"
        state.at = new Date()
        await save(agentId, state)
        await auditAgent(actorId, agentId, AcaoAuditoria.EXECUTAR, {
            depois: { evento: mode === "reprovision" ? "reprovisionar" : "provisionar", canais: state.channels, extras: state.extras.map((item) => item.channel), criados: created, tokenPrefix: issued ? token.prefix : undefined },
        })
        routineLog.info({ agentId, mode, extras: state.extras.length, created }, "[routine-agents] agente provisionado")
    } catch (error) {
        state.status = "error"
        state.error = messageOf(error)
        state.at = new Date()
        await save(agentId, state)
        await auditAgent(actorId, agentId, AcaoAuditoria.EXECUTAR, { depois: { evento: "provisionar", erro: state.error } })
        routineLog.warn({ agentId, mode, err: state.error }, "[routine-agents] provisionamento com erro")
    }
}
