import { DomainError } from "@/lib/api/route"
import { openEventStream } from "@/features/agentic/server/stream"
import { refinementIdForTask } from "./service"

/**
 * Stream NDJSON do refinamento: o mesmo formato das sessões longas da mesa, chaveado pela tarefa.
 * `404` quando a tarefa ainda não tem refinamento.
 */
export async function openRefinementStream(taskId: string, signal: AbortSignal): Promise<Response> {
    const id = await refinementIdForTask(taskId)
    if (!id) throw new DomainError(404, "Refinamento não encontrado", "REFINEMENT_NOT_FOUND")
    return openEventStream(id, signal)
}
