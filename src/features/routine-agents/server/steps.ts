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

export function forgetRunStepThrottle(runId: string): void {
    lastPublish.delete(runId)
}
