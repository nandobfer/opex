import { RoutineAgent, RoutineRun } from "@/lib/db/models/RoutineAgent"
import { INSTANCE_ID } from "@/lib/instance"
import { liveActivations, liveResolutions, stopActivation } from "./hub"
import { inFlight } from "./provisioning-registry"
import { messageOf, routineLog } from "./shared"
import { HEARTBEAT_INTERVAL_MS } from "../heartbeat-rules"

/**
 * Batimento das instâncias (OPE-147). A prévia do Opex e o Opex original usam o mesmo banco: o que
 * está vivo só na memória de um processo (turno da execução, provisionamento, resposta a uma
 * confirmação) é invisível para o outro. Cada processo grava, a cada `HEARTBEAT_INTERVAL_MS`, o
 * batimento de tudo o que roda nele; o tick só considera algo interrompido depois de
 * `HEARTBEAT_STALE_MS` sem batimento (folga larga contra diferença de relógio entre containers).
 */

export { HEARTBEAT_INTERVAL_MS, HEARTBEAT_STALE_MS, isBeatStale } from "../heartbeat-rules"

/** Grava um batimento de tudo o que está vivo neste processo. Devolve se havia algo vivo. */
export async function beatOnce(now = new Date()): Promise<boolean> {
    const activations = liveActivations()
    const provisioning = [...inFlight.keys()]
    const resolutions = liveResolutions()
    const writes: Promise<unknown>[] = [
        // O filtro pelo id da ativação impede bater por uma execução já retomada noutra instância.
        ...activations.map(async (activation) => {
            const beat = await RoutineRun.updateOne({ _id: activation.runId, activationId: activation.activationId, status: { $in: ["running", "waiting"] } }, { $set: { heartbeatAt: now, instance: INSTANCE_ID } }, { timestamps: false })
            // A execução foi fechada ou retomada noutra instância (cancelada lá, ou este processo ficou
            // travado além da folga): este turno não é mais dono dela e para.
            if (!beat.matchedCount) {
                routineLog.warn({ runId: activation.runId, activationId: activation.activationId }, "[routine-agents] turno sem a execução no banco (fechada ou retomada noutra instância): interrompido")
                stopActivation(activation.runId, "canceled")
            }
        }),
        // Sem `timestamps`: o batimento não muda o `updatedAt` que o tick usa para avançar os gatilhos.
        ...provisioning.map((agentId) => RoutineAgent.updateOne({ _id: agentId, provisioningInstance: INSTANCE_ID }, { $set: { provisioningBeatAt: now } }, { timestamps: false })),
        ...resolutions.map((runId) => RoutineRun.updateOne({ _id: runId, "pendingAction.resolvingBy": INSTANCE_ID }, { $set: { "pendingAction.resolvingBeatAt": now } }, { timestamps: false })),
    ]
    const results = await Promise.allSettled(writes)
    for (const result of results) if (result.status === "rejected") routineLog.warn({ err: messageOf(result.reason) }, "[routine-agents] batimento não gravado")
    return writes.length > 0
}

const globalHeartbeat = globalThis as unknown as { __routineHeartbeat?: ReturnType<typeof setInterval> | null }

/** Liga o laço do batimento (um por processo); ele se desliga quando não há mais nada vivo. */
export function ensureHeartbeat(): void {
    if (globalHeartbeat.__routineHeartbeat) return
    const timer = setInterval(() => {
        void beatOnce().then(
            (alive) => {
                if (!alive && globalHeartbeat.__routineHeartbeat === timer) stopHeartbeat()
            },
            (error: unknown) => routineLog.warn({ err: messageOf(error) }, "[routine-agents] batimento falhou"),
        )
    }, HEARTBEAT_INTERVAL_MS)
    timer.unref?.()
    globalHeartbeat.__routineHeartbeat = timer
}

export function stopHeartbeat(): void {
    if (globalHeartbeat.__routineHeartbeat) clearInterval(globalHeartbeat.__routineHeartbeat)
    globalHeartbeat.__routineHeartbeat = null
}

export const isHeartbeatRunning = (): boolean => Boolean(globalHeartbeat.__routineHeartbeat)
