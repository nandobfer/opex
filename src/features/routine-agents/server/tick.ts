import { RoutineAgent, RoutineRun } from "@/lib/db/models/RoutineAgent"
import { dueFire } from "../recurrence"
import { checkRunLimits } from "../limits"
import { isActivationAlive } from "./hub"
import { isProvisioningInFlight, PROVISIONING_INTERRUPTED_MESSAGE } from "./provisioning-registry"
import { closeParkedRun, pumpAgent, requeueParkedRun, triggerRoutineRun } from "./runs"
import { isRoutineActionResolving, RESOLUTION_INTERRUPTED_NOTE, resolutionNote } from "./run-actions"
import { messageOf, publishAgentUpdated, routineDb, routineLog, type RoutineAgentDoc, type RoutineRunDoc } from "./shared"

/**
 * Rotina do agendador interno para os agentes rotineiros (OPE-130), chamada no fim de
 * `runSchedulerTick` (a cada minuto). Em ordem:
 * 0. provisionamento "Provisionando"/pendente sem processo vivo (reinício) → **com erro**, para o
 *    dono usar "Tentar de novo";
 * 1. turnos perdidos (Executando/Esperando sem turno vivo, ex.: reinício) → **Erro**;
 * 2. confirmação já respondida que não voltou para a fila (reinício ou falha entre a resposta e a
 *    fila) → volta para a fila com o texto gravado na resposta;
 *    hibernadas/aguardando confirmação além do tempo total de espera → **Expirada**;
 * 3. hibernadas vencidas voltam para a fila (com o atraso registrado);
 * 4. disparos agendados vencidos: um só por gatilho, mesmo com várias janelas perdidas; agente
 *    pausado/arquivado descarta o disparo (sem acumular);
 * 5. a fila de cada agente anda.
 */

export const LOST_TURN_MESSAGE = "O turno da execução foi perdido"
/** Folga entre reservar a vaga e registrar o turno vivo. */
const LOST_GRACE_MS = 30_000
/** Folga entre gravar "running"/"pending" e registrar o provisionamento vivo. */
const PROVISIONING_GRACE_MS = 120_000
/** Folga entre a resposta do dono e a volta para a fila (a ação confirmada pode estar rodando). */
const RESOLVED_GRACE_MS = 60_000
const BATCH = 100

export async function runDueRoutineAgents(now = new Date()): Promise<{ lost: number; expired: number; resumed: number; fired: number }> {
    await routineDb()
    const summary = { lost: 0, expired: 0, resumed: 0, fired: 0 }
    const touched = new Set<string>()

    const provisioning = await RoutineAgent.find({ "provisioning.status": { $in: ["running", "pending"] } }).limit(BATCH).lean<RoutineAgentDoc[]>()
    for (const agent of provisioning) {
        const agentId = String(agent._id)
        const since = agent.provisioning?.at ?? agent.updatedAt
        if (isProvisioningInFlight(agentId) || (since && now.getTime() - new Date(since).getTime() < PROVISIONING_GRACE_MS)) continue
        const status = agent.provisioning!.status
        const updated = await RoutineAgent.updateOne({ _id: agentId, "provisioning.status": status }, { $set: { "provisioning.status": "error", "provisioning.error": PROVISIONING_INTERRUPTED_MESSAGE } })
        if (updated.modifiedCount) {
            routineLog.warn({ agentId, status }, "[routine-agents] provisionamento interrompido (sem processo vivo)")
            await publishAgentUpdated(agentId)
        }
    }

    const live = await RoutineRun.find({ status: { $in: ["running", "waiting"] }, activationStartedAt: { $lte: new Date(now.getTime() - LOST_GRACE_MS) } })
        .limit(BATCH)
        .lean<RoutineRunDoc[]>()
    for (const run of live) {
        if (isActivationAlive(String(run._id))) continue
        if (await closeParkedRun(run, "error", { error: LOST_TURN_MESSAGE, actorId: "local", from: ["running", "waiting"] })) summary.lost++
    }

    const parked = await RoutineRun.find({ status: { $in: ["hibernating", "awaiting_confirmation"] } }).limit(BATCH * 5).lean<RoutineRunDoc[]>()
    for (const run of parked) {
        const resolvedAt = run.status === "awaiting_confirmation" ? run.pendingAction?.resolvedAt : null
        if (resolvedAt) {
            if (isRoutineActionResolving(String(run._id)) || now.getTime() - new Date(resolvedAt).getTime() < RESOLVED_GRACE_MS) continue
            const action = run.pendingAction!
            const resumeNote = run.resumeNote ?? `${resolutionNote(action, action.resolution === "rejected" ? "rejected" : "confirmed", action.note)}\n${RESOLUTION_INTERRUPTED_NOTE}`
            if (await requeueParkedRun(run, "awaiting_confirmation", { resumeNote })) {
                routineLog.warn({ runId: String(run._id) }, "[routine-agents] confirmação respondida retomada pelo agendador")
                summary.resumed++
                touched.add(String(run.agentId))
            }
            continue
        }
        const parkedMs = run.parkedAt ? now.getTime() - new Date(run.parkedAt).getTime() : 0
        const verdict = checkRunLimits({ activeMs: run.activeMs ?? 0, waitingMs: (run.waitingMs ?? 0) + parkedMs, tokens: run.tokens ?? 0 }, run.snapshot.limits, "parked")
        if (verdict.kind === "expired") {
            if (await closeParkedRun(run, "expired", { error: verdict.message, actorId: "local", from: [run.status] })) summary.expired++
            continue
        }
        if (run.status === "hibernating" && run.hibernation && new Date(run.hibernation.at).getTime() <= now.getTime()) {
            const delayMs = Math.max(0, now.getTime() - new Date(run.hibernation.at).getTime())
            if (await requeueParkedRun(run, "hibernating", { delayMs, hibernation: null })) {
                summary.resumed++
                touched.add(String(run.agentId))
            }
        }
    }

    const agents = await RoutineAgent.find({ "triggers.nextAt": { $lte: now } }).lean<RoutineAgentDoc[]>()
    for (const agent of agents) {
        const agentId = String(agent._id)
        const states = agent.triggers ?? []
        let changed = false
        const fires: { triggerId: string; kind: "schedule" | "once"; delayMs: number }[] = []
        const next = states.map((state) => {
            const fire = dueFire(state.trigger, state.nextAt ? new Date(state.nextAt) : null, now)
            if (!fire) return state
            changed = true
            if (agent.status === "active" && agent.provisioning?.status === "ok") fires.push({ triggerId: state.trigger.id, kind: state.trigger.kind === "once" ? "once" : "schedule", delayMs: fire.delayMs })
            else routineLog.info({ agentId, trigger: state.trigger.id, status: agent.status }, "[routine-agents] disparo agendado descartado (agente pausado, arquivado ou sem provisionamento)")
            return { ...state, nextAt: fire.nextAt, lastFiredAt: now }
        })
        if (!changed) continue
        // Avança o próximo horário antes de disparar: dois ticks nunca disparam a mesma janela.
        const updated = await RoutineAgent.updateOne({ _id: agent._id, updatedAt: agent.updatedAt }, { $set: { triggers: next } })
        if (!updated.modifiedCount) continue
        for (const fire of fires) {
            try {
                await triggerRoutineRun(agentId, { origin: fire.kind, triggerId: fire.triggerId, delayMs: fire.delayMs }, "local")
                summary.fired++
            } catch (error) {
                routineLog.warn({ agentId, trigger: fire.triggerId, err: messageOf(error) }, "[routine-agents] disparo agendado falhou")
            }
        }
    }

    const queuedAgents = await RoutineRun.distinct("agentId", { status: "queued" })
    for (const agentId of [...queuedAgents.map(String), ...touched]) await pumpAgent(agentId).catch(() => undefined)
    return summary
}
