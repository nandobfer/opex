import { DomainError } from "@/lib/api/route"
import { RoutineAgent, RoutineRun, type IRoutineAgent } from "@/lib/db/models/RoutineAgent"
import { buildTriggerStates, nextFireAt } from "../recurrence"
import type { RoutineAgentInput, RoutineListFilter } from "../schemas"
import { pendingRoutineNameKey, pendingRoutineSlug, routineNameKey, uniqueRoutineSlug } from "../slug"
import { identityNeeds } from "../identity-plan"
import type { RoutineAgentStatus } from "../status"
import type { RoutineAgentDto } from "../types"
import { startProvisioning } from "./provisioning"
import { isProvisioningLive } from "./provisioning-registry"
import { AcaoAuditoria, auditAgent, loadAgentDoc, notFoundAgent, publishAgentUpdated, routineDb, toAgentDto, type RoutineAgentDoc } from "./shared"

/**
 * Cadastro dos agentes rotineiros (OPE-130). Não existe exclusão: **Pausar** (agendados não disparam,
 * webhook 409, execuções em andamento terminam) e **Arquivar** (pausa + sai da barra lateral e da lista
 * padrão). O Engramind fica intacto nos dois casos. Editar objetivo ou instruções **não** reprovisiona;
 * o slug nasce do nome e é fixo (renomear não troca os canais).
 *
 * Nome e objetivo são opcionais (D8): criado sem nome, o agente ganha slug e `nameKey` provisórios e o
 * passo `identity` do provisionamento gera o que falta (e fixa o slug). Na edição, esvaziar o nome ou o
 * objetivo gera de novo só o campo vazio (modo `identity`; o slug e os canais não mudam).
 */

const NAME_TAKEN = () => new DomainError(409, "Já existe um agente rotineiro com esse nome", "ROUTINE_AGENT_NAME_TAKEN")

async function assertNameFree(name: string, exceptId?: string): Promise<void> {
    const existing = await RoutineAgent.findOne({ nameKey: routineNameKey(name), ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select({ _id: 1 }).lean()
    if (existing) throw NAME_TAKEN()
}

const isDuplicateKey = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: number }).code === 11000

/** Snapshot de auditoria (sem token nem segredo). */
const auditView = (doc: Pick<IRoutineAgent, "name" | "objective" | "engine" | "opex" | "opencode" | "confirmIrreversible" | "limits" | "status"> & { triggers: { trigger: unknown }[] }) => ({
    nome: doc.name,
    objetivo: doc.objective,
    motor: doc.engine,
    modelo: doc.engine === "opex" ? `${doc.opex.provider ?? ""}/${doc.opex.model}` : doc.opencode.model,
    confirmacao: doc.confirmIrreversible,
    limites: doc.limits,
    gatilhos: doc.triggers.map((state) => state.trigger),
    status: doc.status,
})

async function runSummaries(ids: string[]): Promise<Map<string, { lastRun: RoutineAgentDto["lastRun"]; activeRuns: number }>> {
    const result = new Map<string, { lastRun: RoutineAgentDto["lastRun"]; activeRuns: number }>()
    if (!ids.length) return result
    const { Types } = await import("mongoose")
    const objectIds = ids.map((id) => new Types.ObjectId(id))
    const [last, active] = await Promise.all([
        RoutineRun.aggregate<{ _id: unknown; id: unknown; status: string; at: Date }>([
            { $match: { agentId: { $in: objectIds } } },
            { $sort: { createdAt: -1 } },
            { $group: { _id: "$agentId", id: { $first: "$_id" }, status: { $first: "$status" }, at: { $first: "$createdAt" } } },
        ]),
        RoutineRun.aggregate<{ _id: unknown; count: number }>([{ $match: { agentId: { $in: objectIds }, status: { $in: ["queued", "running", "waiting", "hibernating", "awaiting_confirmation"] } } }, { $group: { _id: "$agentId", count: { $sum: 1 } } }]),
    ])
    for (const id of ids) result.set(id, { lastRun: null, activeRuns: 0 })
    for (const row of last) result.get(String(row._id))!.lastRun = { id: String(row.id), status: row.status as never, at: new Date(row.at).toISOString() }
    for (const row of active) result.get(String(row._id))!.activeRuns = row.count
    return result
}

export async function listRoutineAgents(filter: RoutineListFilter = "current"): Promise<RoutineAgentDto[]> {
    await routineDb()
    const query = filter === "archived" ? RoutineAgent.find({ status: "archived" }) : RoutineAgent.find({ status: { $ne: "archived" } })
    const docs = await query.sort({ name: 1 }).lean<RoutineAgentDoc[]>()
    const summaries = await runSummaries(docs.map((doc) => String(doc._id)))
    return docs.map((doc) => toAgentDto(doc, summaries.get(String(doc._id))))
}

export async function getRoutineAgent(id: string): Promise<RoutineAgentDto> {
    const doc = await loadAgentDoc(id)
    return toAgentDto(doc, (await runSummaries([id])).get(id))
}

export async function createRoutineAgent(input: RoutineAgentInput, actorId: string): Promise<RoutineAgentDto> {
    await routineDb()
    const { Types } = await import("mongoose")
    const _id = new Types.ObjectId()
    const named = Boolean(input.name)
    if (named) await assertNameFree(input.name)
    const taken = new Set((await RoutineAgent.find({}).select({ slug: 1 }).lean()).map((doc) => doc.slug))
    const slug = named ? uniqueRoutineSlug(input.name, taken) : pendingRoutineSlug(String(_id))
    const now = new Date()
    let doc: RoutineAgentDoc
    try {
        const created = await RoutineAgent.create({
            _id,
            name: input.name,
            nameKey: named ? routineNameKey(input.name) : pendingRoutineNameKey(String(_id)),
            slug,
            objective: input.objective,
            generated: { name: false, objective: false },
            instructions: input.instructions,
            engine: input.engine,
            opex: input.opex,
            opencode: input.opencode,
            confirmIrreversible: input.confirmIrreversible,
            limits: input.limits,
            triggers: buildTriggerStates(input.triggers, [], now),
            status: "active",
            provisioning: { status: "pending", error: null, at: null, steps: { identity: false, agent: false, token: false, channels: false, extras: false, workdir: false }, channels: [], extras: [], blocked: [], warnings: [] },
            engramindToken: null,
            workdir: null,
        })
        doc = created.toObject() as RoutineAgentDoc
    } catch (error) {
        if (isDuplicateKey(error)) throw NAME_TAKEN()
        throw error
    }
    const id = String(doc._id)
    await auditAgent(actorId, id, AcaoAuditoria.CRIAR, { depois: { ...auditView(doc), slug } })
    await publishAgentUpdated(id)
    void startProvisioning(id, "create", actorId)
    return toAgentDto(doc)
}

export async function updateRoutineAgent(id: string, input: RoutineAgentInput, actorId: string): Promise<RoutineAgentDto> {
    const before = await loadAgentDoc(id)
    if (input.name && input.name !== before.name) await assertNameFree(input.name, id)
    const triggers = buildTriggerStates(input.triggers, before.triggers ?? [], new Date())
    const generated = before.generated ?? { name: false, objective: false }
    const next = {
        name: input.name,
        nameKey: input.name ? routineNameKey(input.name) : pendingRoutineNameKey(id),
        objective: input.objective,
        // O selo "Gerado" some quando o dono edita (ou esvazia) o campo.
        generated: { name: generated.name && input.name === before.name, objective: generated.objective && input.objective === before.objective },
        instructions: input.instructions,
        engine: input.engine,
        opex: input.opex,
        opencode: input.opencode,
        confirmIrreversible: input.confirmIrreversible,
        limits: input.limits,
        triggers,
    }
    try {
        await RoutineAgent.updateOne({ _id: id }, { $set: next })
    } catch (error) {
        if (isDuplicateKey(error)) throw NAME_TAKEN()
        throw error
    }
    const after = await loadAgentDoc(id)
    await auditAgent(actorId, id, AcaoAuditoria.ATUALIZAR, { antes: auditView(before), depois: auditView(after) })
    const needs = identityNeeds(after)
    // Campo esvaziado: o subagente gera de novo só ele (o provisionamento em andamento já trata o vazio).
    if ((needs.name || needs.objective) && !isProvisioningLive(after)) {
        const mode = after.provisioning?.status === "ok" ? "identity" : "retry"
        await RoutineAgent.updateOne({ _id: id }, { $set: { "provisioning.status": "running", "provisioning.error": null, "provisioning.at": new Date() } })
        void startProvisioning(id, mode, actorId)
    }
    await publishAgentUpdated(id)
    return getRoutineAgent(id)
}

const STATUS_EVENTS: Record<"pause" | "resume" | "archive" | "unarchive", { from: RoutineAgentStatus[]; to: RoutineAgentStatus; evento: string }> = {
    pause: { from: ["active"], to: "paused", evento: "pausar" },
    resume: { from: ["paused"], to: "active", evento: "retomar" },
    archive: { from: ["active", "paused"], to: "archived", evento: "arquivar" },
    unarchive: { from: ["archived"], to: "paused", evento: "desarquivar" },
}

/**
 * Pausar/Retomar/Arquivar/Desarquivar. Desarquivar volta **pausado** (o dono retoma de propósito).
 * Ao retomar, os agendados recalculam a partir de agora: o que venceu na pausa é descartado.
 */
export async function setRoutineAgentStatus(id: string, action: keyof typeof STATUS_EVENTS, actorId: string): Promise<RoutineAgentDto> {
    const before = await loadAgentDoc(id)
    const rule = STATUS_EVENTS[action]
    if (before.status === rule.to) return getRoutineAgent(id)
    if (!rule.from.includes(before.status)) throw new DomainError(409, `Não é possível ${rule.evento} um agente ${before.status === "archived" ? "arquivado" : before.status === "paused" ? "pausado" : "ativo"}`, "ROUTINE_AGENT_INVALID_STATUS")
    const set: Record<string, unknown> = { status: rule.to }
    if (rule.to === "active") {
        const now = new Date()
        // O agendado único que venceu na pausa já foi descartado pelo tick (`nextAt` nulo); os recorrentes recomeçam de agora.
        set.triggers = (before.triggers ?? []).map((state) => (state.trigger.kind === "once" ? state : { ...state, nextAt: nextFireAt(state.trigger, now, null) }))
    }
    const updated = await RoutineAgent.findOneAndUpdate({ _id: id, status: before.status }, { $set: set }, { new: true }).lean()
    if (!updated) throw notFoundAgent()
    await auditAgent(actorId, id, AcaoAuditoria.ATUALIZAR, { antes: { status: before.status }, depois: { status: rule.to, evento: rule.evento } })
    await publishAgentUpdated(id)
    return getRoutineAgent(id)
}

/** "Reprovisionar" (reavalia os extras, só acrescenta) e "Tentar de novo" (retoma o que faltou). */
export async function reprovisionRoutineAgent(id: string, mode: "reprovision" | "retry", actorId: string): Promise<RoutineAgentDto> {
    const doc = await loadAgentDoc(id)
    // "running" sem provisionamento vivo (neste processo ou com batimento de outra instância) é obsoleto: a nova tentativa segue.
    if (doc.provisioning?.status === "running" && isProvisioningLive(doc)) throw new DomainError(409, "O provisionamento deste agente já está em andamento", "ROUTINE_AGENT_PROVISIONING")
    await RoutineAgent.updateOne({ _id: id }, { $set: { "provisioning.status": "running", "provisioning.error": null, "provisioning.at": new Date() } })
    await publishAgentUpdated(id)
    void startProvisioning(id, mode, actorId)
    return getRoutineAgent(id)
}
