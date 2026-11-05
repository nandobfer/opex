import { RoutineAgent, RoutineRun } from "@/lib/db/models/RoutineAgent"
import { dueFire } from "../recurrence"
import { checkRunLimits } from "../limits"
import { isActivationAlive } from "./hub"
import { closeParkedRun, pumpAgent, requeueParkedRun, triggerRoutineRun } from "./runs"
import { messageOf, routineDb, routineLog, type RoutineAgentDoc, type RoutineRunDoc } from "./shared"

/**
 * Rotina do agendador interno para os agentes rotineiros (OPE-130), chamada no fim de
 * `runSchedulerTick` (a cada minuto). Em ordem:
 * 1. turnos perdidos (Executando/Esperando sem turno vivo, ex.: reinício) → **Erro**;
 * 2. hibernadas/aguardando confirmação além do tempo total de espera → **Expirada**;
 * 3. hibernadas vencidas voltam para a fila (com o atraso registrado);
 * 4. disparos agendados vencidos: um só por gatilho, mesmo com várias janelas perdidas; agente
 *    pausado/arquivado descarta o disparo (sem acumular);
 * 5. a fila de cada agente anda.
 */

export const LOST_TURN_MESSAGE = "O turno da execução foi perdido"
/** Folga entre reservar a vaga e registrar o turno vivo. */
const LOST_GRACE_MS = 30_000
const BATCH = 100

export async function runDueRoutineAgents(now = new Date()): Promise<{ lost: number; expired: number; resumed: number; fired: number }> {
    await routineDb()
    const summary = { lost: 0, expired: 0, resumed: 0, fired: 0 }
    const touched = new Set<string>()

    const live = await RoutineRun.find({ status: { $in: ["running", "waiting"] }, activationStartedAt: { $lte: new Date(now.getTime() - LOST_GRACE_MS) } })
        .limit(BATCH)
        .lean<RoutineRunDoc[]>()
    for (const run of live) {
        if (isActivationAlive(String(run._id))) continue
        if (await closeParkedRun(run, "error", { error: LOST_TURN_MESSAGE, actorId: "local", from: ["running", "waiting"] })) summary.lost++
    }

    const parked = await RoutineRun.find({ status: { $in: ["hibernating", "awaiting_confirmation"] } }).limit(BATCH * 5).lean<RoutineRunDoc[]>()
    for (const run of parked) {
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
