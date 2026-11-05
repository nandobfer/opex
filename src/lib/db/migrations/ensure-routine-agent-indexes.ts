import { RoutineAgent, RoutineEntry, RoutineRun, RoutineRunStep } from "@/lib/db/models/RoutineAgent"

/** Índices dos agentes rotineiros (OPE-130). Idempotente em cada boot. */
export async function ensureRoutineAgentIndexes(): Promise<void> {
    await Promise.all([RoutineAgent.createIndexes(), RoutineRun.createIndexes(), RoutineRunStep.createIndexes(), RoutineEntry.createIndexes()])
}
