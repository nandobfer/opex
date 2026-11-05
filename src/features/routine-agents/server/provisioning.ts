import { ensureMemoryChannel, ensureAppToken } from "@/features/engramind/server/memory-network"
import { engramindTarget, type EngramindTarget } from "@/features/engramind/server/client"
import { AI_AGENTS, memoryChannelName } from "@/features/ai/agents"
import { RoutineAgent, type IRoutineProvisioning } from "@/lib/db/models/RoutineAgent"
import { ROUTINE_GLOBAL_CHANNEL, ROUTINE_PROVISIONING_ORIGIN, routineChannelOf } from "../constants"
import { EXTRA_CHANNELS_INSTRUCTIONS, extraChannelPrompt, parseExtraChannelPlan } from "../provision-plan"
import { IDENTITY_INSTRUCTIONS, identityNeeds, identityPrompt, parseGeneratedIdentity, routineAgentTitle } from "../identity-plan"
import { isPendingRoutineSlug, routineNameKey, uniqueRoutineSlug } from "../slug"
import { baseRoutineChannels, ensureRoutineEngramindAgent, ensureRoutineSubscriptions, ensureRoutineToken, listEngramindChannels } from "./engramind"
import { inFlight } from "./provisioning-registry"
import { loadRoutineAgentSettings } from "./settings"
import { AcaoAuditoria, auditAgent, loadAgentDoc, messageOf, publishAgentUpdated, routineLog, type RoutineAgentDoc } from "./shared"

/**
 * Subagente de provisionamento (OPE-130). Roda sozinho ao criar o agente (e em "Tentar de novo" /
 * "Reprovisionar"), sem pedir aprovação, e aplica tudo:
 * 0. `identity` (D8): gera o nome (só o papel) e/ou o objetivo que o dono deixou vazios, com uma nova
 *    tentativa quando a resposta é recusada, e fixa o slug definitivo do agente criado sem nome;
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

/** `identity`: só o passo 0 (o dono esvaziou o nome ou o objetivo de um agente já provisionado). */
export type ProvisionMode = "create" | "retry" | "reprovision" | "identity"


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
async function askPlanner(doc: RoutineAgentDoc, prompt: string, instructions = EXTRA_CHANNELS_INSTRUCTIONS): Promise<string> {
    const settings = await loadRoutineAgentSettings()
    if (!settings.provider || !settings.model) throw new Error(NO_MODEL_MESSAGE)
    const { streamAi } = await import("@/lib/ai/stream")
    let text = ""
    for await (const event of streamAi({
        provider: settings.provider,
        model: settings.model,
        variant: settings.variant,
        agent: settings.agent,
        instructions,
        prompt,
        title: `Provisionamento · ${routineAgentTitle(doc.name)}`,
        consumption: { origin: ROUTINE_PROVISIONING_ORIGIN, subject: String(doc._id) },
    })) {
        if (event.type === "delta") text += event.text
        if (event.type === "error") throw new Error(event.message)
    }
    return text
}

export const IDENTITY_FAILED_PREFIX = "Não foi possível gerar o nome do agente"

/** Nomes que o gerado não pode repetir: os agentes fixos e os outros rotineiros. */
async function takenNames(agentId: string): Promise<string[]> {
    const { AGENT_CATALOG } = await import("@/features/agent-metrics/catalog")
    const others = await RoutineAgent.find({ _id: { $ne: agentId } }).select({ name: 1 }).lean<{ name?: string }[]>()
    return [...AGENT_CATALOG.filter((agent) => agent.id !== "rotineiros").map((agent) => agent.navLabel), ...others.map((other) => other.name ?? "").filter(Boolean)]
}

/** Passo `identity`: gera só o que está vazio e fixa o slug do agente criado sem nome. Devolve o doc atualizado. */
async function ensureIdentity(doc: RoutineAgentDoc, actorId: string): Promise<RoutineAgentDoc> {
    const agentId = String(doc._id)
    const needs = identityNeeds({ name: doc.name ?? "", objective: doc.objective ?? "" })
    if (!needs.name && !needs.objective) return doc
    const taken = await takenNames(agentId)
    const context = { name: doc.name ?? "", objective: doc.objective ?? "", instructions: doc.instructions ?? "", takenNames: taken }
    let generated: { name?: string; objective?: string } | null = null
    let problem = ""
    // Validação restritiva com UMA nova tentativa (o modelo recebe o motivo da recusa).
    for (let attempt = 0; attempt < 2 && !generated; attempt++) {
        try {
            generated = parseGeneratedIdentity(await askPlanner(doc, identityPrompt(context, needs, problem || undefined), IDENTITY_INSTRUCTIONS), needs, taken)
        } catch (error) {
            problem = messageOf(error)
            if (problem.startsWith("Configure o modelo")) throw error
        }
    }
    if (!generated) throw new Error(`${IDENTITY_FAILED_PREFIX}: ${problem}. Informe o nome e o objetivo e tente de novo.`)
    const set: Record<string, unknown> = {}
    if (generated.name) {
        set.name = generated.name
        set.nameKey = routineNameKey(generated.name)
        set["generated.name"] = true
        if (isPendingRoutineSlug(doc.slug)) {
            const slugs = new Set((await RoutineAgent.find({ _id: { $ne: agentId } }).select({ slug: 1 }).lean<{ slug: string }[]>()).map((other) => other.slug))
            set.slug = uniqueRoutineSlug(generated.name, slugs)
        }
    }
    if (generated.objective) {
        set.objective = generated.objective
        set["generated.objective"] = true
    }
    // Só grava se o campo continua vazio (o dono pode ter preenchido enquanto o subagente gerava).
    const guard: Record<string, unknown> = { _id: agentId }
    if (generated.name) guard.name = ""
    if (generated.objective) guard.objective = ""
    const updated = await RoutineAgent.updateOne(guard, { $set: set })
    if (updated.modifiedCount) {
        await auditAgent(actorId, agentId, AcaoAuditoria.ATUALIZAR, { depois: { evento: "gerar identidade", nome: generated.name, objetivo: generated.objective, slug: set.slug } })
        routineLog.info({ agentId, name: generated.name ?? null, objective: Boolean(generated.objective) }, "[routine-agents] identidade gerada")
    }
    return loadAgentDoc(agentId)
}

export async function provisionRoutineAgent(agentId: string, mode: ProvisionMode, actorId: string): Promise<void> {
    let doc = await loadAgentDoc(agentId)
    const state: IRoutineProvisioning = {
        status: "running",
        error: null,
        at: new Date(),
        steps: { identity: false, ...(doc.provisioning?.steps ?? { agent: false, token: false, channels: false, extras: false, workdir: false }) },
        channels: doc.provisioning?.channels ?? [],
        extras: doc.provisioning?.extras ?? [],
        warnings: [],
    }
    await save(agentId, state)
    const created: string[] = []
    try {
        doc = await ensureIdentity(doc, actorId)
        state.steps.identity = true
        await publishAgentUpdated(agentId)
        if (mode === "identity") {
            state.status = "ok"
            state.at = new Date()
            await save(agentId, state)
            return
        }
        let admin: EngramindTarget
        try {
            admin = await engramindTarget()
        } catch (error) {
            throw new Error(`Engramind indisponível: ${messageOf(error)}. Confira a integração Engramind e tente de novo.`)
        }
        const app = (await ensureAppToken(admin, actorId, state.warnings)) ?? admin

        await ensureRoutineEngramindAgent(doc.slug, routineAgentTitle(doc.name), doc.objective, app)
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
