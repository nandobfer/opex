import { RoutineRunStep } from "@/lib/db/models/RoutineAgent"
import type { IRoutineRunStep } from "@/lib/db/models/RoutineAgent"
import { emitRunChange, messageOf, routineLog } from "./shared"
import type { Types } from "mongoose"
import type { RoutineRunStatus } from "../status"

/** Passos da execução (detalhe da tela): gravados sem bloquear o turno e publicados com throttle. */

const PUBLISH_EVERY_MS = 2_000
const lastPublish = new Map<string, number>()

export function recordRunStep(run: { _id: Types.ObjectId; agentId: Types.ObjectId }, step: Omit<IRoutineRunStep, "runId" | "agentId" | "createdAt">, status: RoutineRunStatus = "running"): void {
    void RoutineRunStep.create({ runId: run._id, agentId: run.agentId, ...step })
        .then(() => {
            const key = String(run._id)
            const now = Date.now()
            if (now - (lastPublish.get(key) ?? 0) < PUBLISH_EVERY_MS) return
            lastPublish.set(key, now)
            return emitRunChange(run, status)
        })
        .catch((error: unknown) => routineLog.warn({ runId: String(run._id), err: messageOf(error) }, "[routine-agents] passo da execução não gravado"))
}

/**
 * Retenção dos passos: a execução que hiberna por dias acumula passos sem fim. Ao fechar cada turno,
 * ficam só os `MAX_RUN_STEPS` mais recentes da execução (a tela mostra o fim da linha do tempo).
 */
export const MAX_RUN_STEPS = 500

export async function pruneRunSteps(runId: Types.ObjectId | string, keep = MAX_RUN_STEPS): Promise<number> {
    const [cut] = await RoutineRunStep.find({ runId }).sort({ createdAt: -1 }).skip(keep).limit(1).select({ createdAt: 1 }).lean<{ createdAt: Date }[]>()
    if (!cut) return 0
    const result = await RoutineRunStep.deleteMany({ runId, createdAt: { $lte: cut.createdAt } })
    return result.deletedCount ?? 0
}

export function forgetRunStepThrottle(runId: string): void {
    lastPublish.delete(runId)
}
