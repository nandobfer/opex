import { RoutineAgent, RoutineRun } from "@/lib/db/models/RoutineAgent"
import { dueFire } from "../recurrence"
import { checkRunLimits } from "../limits"
import { activationOf, isRoutineActionResolving } from "./hub"
import { isBeatStale } from "../heartbeat-rules"
import { isProvisioningLive, PROVISIONING_INTERRUPTED_MESSAGE } from "./provisioning-registry"
import { closeParkedRun, pumpAgent, requeueInterruptedRun, requeueParkedRun, triggerRoutineRun } from "./runs"
import { RESOLUTION_INTERRUPTED_NOTE, resolutionNote } from "./run-actions"
import { messageOf, publishAgentUpdated, routineDb, routineLog, type RoutineAgentDoc, type RoutineRunDoc } from "./shared"

/**
 * Rotina do agendador interno para os agentes rotineiros (OPE-130), chamada no fim de
 * `runSchedulerTick` (a cada minuto). Em ordem:
 * 0. provisionamento "Provisionando"/pendente sem batimento há 90 s (reinício) → **com erro**, para o
 *    dono usar "Tentar de novo";
 * 1. turnos interrompidos (Executando/Esperando sem batimento há 90 s: deploy, container parado) →
 *    voltam para a fila uma vez; na segunda interrupção da mesma execução → **Erro**;
 * 2. confirmação já respondida que não voltou para a fila (sem batimento de quem resolvia há 90 s,
 *    ou falha entre a resposta e a fila) → volta para a fila com o texto gravado na resposta;
 *    hibernadas/aguardando confirmação além do tempo total de espera → **Expirada**;
 * 3. hibernadas vencidas voltam para a fila (com o atraso registrado);
 * 4. disparos agendados vencidos: um só por gatilho, mesmo com várias janelas perdidas; agente
 *    pausado/arquivado descarta o disparo (sem acumular);
 * 5. a fila de cada agente anda.
 *
 * Quem está vivo é decidido pelo **batimento no banco** (`heartbeat.ts`, OPE-147), não pela memória
 * deste processo: a prévia do Opex e o Opex original usam o mesmo banco, e um nunca derruba o que
 * roda no outro. (Na prévia o agendador fica desligado; esta rotina roda só no Opex original.)
 */

export const LOST_TURN_MESSAGE = "O turno da execução foi perdido"
const BATCH = 100

export async function runDueRoutineAgents(now = new Date()): Promise<{ lost: number; requeued: number; expired: number; resumed: number; fired: number }> {
    await routineDb()
    const summary = { lost: 0, requeued: 0, expired: 0, resumed: 0, fired: 0 }
    const touched = new Set<string>()

    const provisioning = await RoutineAgent.find({ "provisioning.status": { $in: ["running", "pending"] } }).limit(BATCH).lean<RoutineAgentDoc[]>()
    for (const agent of provisioning) {
        const agentId = String(agent._id)
        if (isProvisioningLive(agent, now)) continue
        const status = agent.provisioning!.status
        const updated = await RoutineAgent.updateOne({ _id: agentId, "provisioning.status": status }, { $set: { "provisioning.status": "error", "provisioning.error": PROVISIONING_INTERRUPTED_MESSAGE } })
        if (updated.modifiedCount) {
            routineLog.warn({ agentId, status }, "[routine-agents] provisionamento interrompido (sem processo vivo)")
            await publishAgentUpdated(agentId)
        }
    }

    const live = await RoutineRun.find({ status: { $in: ["running", "waiting"] } })
        .limit(BATCH * 5)
        .lean<RoutineRunDoc[]>()
    for (const run of live) {
        const local = activationOf(String(run._id))
        if (local && local.activationId === (run.activationId ?? local.activationId)) continue
        // Registros anteriores ao batimento contam a partir do início do turno.
        if (!isBeatStale(run.heartbeatAt ?? run.activationStartedAt, now)) continue
        if ((run.interruptions ?? 0) >= 1) {
            if (await closeParkedRun(run, "error", { error: LOST_TURN_MESSAGE, actorId: "local", from: ["running", "waiting"] })) summary.lost++
        } else if (await requeueInterruptedRun(run, now)) {
            summary.requeued++
            touched.add(String(run.agentId))
        }
    }

    const parked = await RoutineRun.find({ status: { $in: ["hibernating", "awaiting_confirmation"] } }).limit(BATCH * 5).lean<RoutineRunDoc[]>()
    for (const run of parked) {
        const resolvedAt = run.status === "awaiting_confirmation" ? run.pendingAction?.resolvedAt : null
        if (resolvedAt) {
            if (isRoutineActionResolving(String(run._id)) || !isBeatStale(run.pendingAction?.resolvingBeatAt ?? resolvedAt, now)) continue
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
