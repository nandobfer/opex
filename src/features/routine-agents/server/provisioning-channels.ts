import { DomainError } from "@/lib/api/route"
import { RoutineAgent, type IRoutineProvisioning } from "@/lib/db/models/RoutineAgent"
import { MAX_EXTRA_CHANNELS, isEligibleExtraChannel } from "../provision-plan"
import type { RoutineChannelAction } from "../schemas"
import type { RoutineAgentDto } from "../types"
import { baseRoutineChannels, ensureRoutineSubscriptions, removeRoutineSubscription } from "./engramind"
import { isProvisioningInFlight } from "./provisioning-registry"
import { routineEngramindTargets } from "./provisioning"
import { getRoutineAgent } from "./service"
import { AcaoAuditoria, auditAgent, loadAgentDoc, messageOf, publishAgentUpdated, routineLog, type RoutineAgentDoc } from "./shared"

/**
 * Canais extras do provisionamento sob controle do dono (OPE-143). **Remover** um extra cancela só a
 * assinatura do agente no Engramind (o canal, as memórias e os outros assinantes ficam) e registra o canal
 * numa lista de **bloqueados do próprio agente**: o provisionamento (Tentar de novo / Reprovisionar) nunca o
 * assina nem o cria. A lista é reversível: **Desbloquear** (só retira) ou **Assinar de novo** (assina, volta
 * aos extras e retira).
 *
 * O Engramind é acionado ANTES de gravar: se falhar, o registro do agente não muda. Com o provisionamento
 * vivo a ação é recusada (o `save()` dele gravaria por cima).
 */

const BASE_CHANNEL = () => new DomainError(400, "Os canais base (opex, o global dos rotineiros e o canal próprio) não podem ser removidos", "ROUTINE_CHANNEL_BASE")
const INVALID_CHANNEL = () => new DomainError(400, "Este canal não pode ser assinado por um agente rotineiro", "ROUTINE_CHANNEL_INVALID")
const BUSY = () => new DomainError(409, "O provisionamento deste agente está em andamento: aguarde terminar para alterar os canais", "ROUTINE_AGENT_PROVISIONING")
const engramindFailed = (error: unknown, what: string) => new DomainError(502, `Não foi possível ${what} no Engramind: ${messageOf(error)}. Nada foi alterado.`, "ROUTINE_CHANNEL_ENGRAMIND_FAILED")

type Extra = IRoutineProvisioning["extras"][number]
type Blocked = NonNullable<IRoutineProvisioning["blocked"]>[number]

interface Context {
    doc: RoutineAgentDoc
    extras: Extra[]
    blocked: Blocked[]
}

async function load(id: string, channel: string): Promise<Context> {
    const doc = await loadAgentDoc(id)
    if (baseRoutineChannels(doc.slug).includes(channel)) throw BASE_CHANNEL()
    if (!isEligibleExtraChannel(channel)) throw INVALID_CHANNEL()
    if (isProvisioningInFlight(id)) throw BUSY()
    return { doc, extras: doc.provisioning?.extras ?? [], blocked: doc.provisioning?.blocked ?? [] }
}

async function persist(id: string, extras: Extra[], blocked: Blocked[]): Promise<void> {
    await RoutineAgent.updateOne({ _id: id }, { $set: { "provisioning.extras": extras, "provisioning.blocked": blocked } })
}

const view = (extras: Extra[], blocked: Blocked[]) => ({ extras: extras.map((item) => item.channel), bloqueados: blocked.map((item) => item.channel) })

/** Agente já cadastrado no Engramind? Sem isso não há assinatura a cancelar nem a criar. */
const registered = (doc: RoutineAgentDoc) => doc.provisioning?.steps?.agent === true

/** Remove o canal dos extras (cancelando a assinatura) e o bloqueia neste agente. */
export async function blockRoutineChannel(id: string, channel: string, actorId: string): Promise<RoutineAgentDto> {
    const { doc, extras, blocked } = await load(id, channel)
    if (blocked.some((item) => item.channel === channel)) return getRoutineAgent(id)
    let subscription: "removed" | "absent" = "absent"
    if (registered(doc)) {
        try {
            const { app } = await routineEngramindTargets(actorId)
            subscription = await removeRoutineSubscription(doc.slug, channel, app)
        } catch (error) {
            routineLog.warn({ agentId: id, channel, err: messageOf(error) }, "[routine-agents] cancelar a assinatura do canal falhou")
            throw engramindFailed(error, "cancelar a assinatura")
        }
    }
    const wasExtra = extras.find((item) => item.channel === channel)
    const nextExtras = extras.filter((item) => item.channel !== channel)
    const nextBlocked = [...blocked, { channel, name: wasExtra?.name ?? channel, at: new Date() }]
    await persist(id, nextExtras, nextBlocked)
    await auditAgent(actorId, id, AcaoAuditoria.ATUALIZAR, { antes: view(extras, blocked), depois: { ...view(nextExtras, nextBlocked), evento: wasExtra ? "remover canal extra" : "bloquear canal", canal: channel, assinatura: subscription } })
    await publishAgentUpdated(id)
    routineLog.info({ agentId: id, channel, subscription, wasExtra: Boolean(wasExtra) }, "[routine-agents] canal bloqueado")
    return getRoutineAgent(id)
}

/** Tira o canal do bloqueio; com `resubscribe`, assina de novo e o devolve aos extras. */
export async function unblockRoutineChannel(id: string, channel: string, options: { resubscribe?: boolean }, actorId: string): Promise<RoutineAgentDto> {
    const { doc, extras, blocked } = await load(id, channel)
    const entry = blocked.find((item) => item.channel === channel)
    if (!entry) {
        if (options.resubscribe && extras.some((item) => item.channel === channel)) return getRoutineAgent(id)
        throw new DomainError(404, "Este canal não está bloqueado neste agente", "ROUTINE_CHANNEL_NOT_BLOCKED")
    }
    const nextBlocked = blocked.filter((item) => item.channel !== channel)
    let nextExtras = extras
    if (options.resubscribe) {
        if (!registered(doc)) throw new DomainError(409, 'O agente ainda não foi cadastrado no Engramind: use "Tentar de novo" antes de assinar canais', "ROUTINE_AGENT_NOT_PROVISIONED")
        if (extras.length >= MAX_EXTRA_CHANNELS) throw new DomainError(409, `O agente já tem ${MAX_EXTRA_CHANNELS} canais extras: remova um antes de assinar outro`, "ROUTINE_CHANNEL_LIMIT")
        try {
            const { app } = await routineEngramindTargets(actorId)
            await ensureRoutineSubscriptions(doc.slug, [channel], app)
        } catch (error) {
            routineLog.warn({ agentId: id, channel, err: messageOf(error) }, "[routine-agents] assinar o canal de novo falhou")
            throw engramindFailed(error, "assinar o canal")
        }
        nextExtras = [...extras, { channel, name: entry.name, reason: "Assinado de novo pelo dono", created: false }]
    }
    await persist(id, nextExtras, nextBlocked)
    await auditAgent(actorId, id, AcaoAuditoria.ATUALIZAR, { antes: view(extras, blocked), depois: { ...view(nextExtras, nextBlocked), evento: options.resubscribe ? "assinar canal de novo" : "desbloquear canal", canal: channel } })
    await publishAgentUpdated(id)
    routineLog.info({ agentId: id, channel, resubscribe: Boolean(options.resubscribe) }, "[routine-agents] canal desbloqueado")
    return getRoutineAgent(id)
}

export function applyRoutineChannelAction(id: string, action: RoutineChannelAction, channel: string, actorId: string): Promise<RoutineAgentDto> {
    if (action === "block") return blockRoutineChannel(id, channel, actorId)
    return unblockRoutineChannel(id, channel, { resubscribe: action === "resubscribe" }, actorId)
}
