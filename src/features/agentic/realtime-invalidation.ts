/**
 * Alvo de um `agentic-updated` de mesa (`{ centralId, workbenchId, taskId }`) e quais consultas são de
 * outra mesa (módulo puro, OPE-188). Uma consulta de outra mesa só fica desatualizada: é buscada de novo
 * na próxima visita, sem refazer agora a mesa aberta por causa do avanço de outra.
 */
export interface WorkbenchEventTarget {
    workbenchId: string
    taskId: string | null
}

export function workbenchEventTarget(payload: unknown): WorkbenchEventTarget | null {
    if (typeof payload !== "object" || payload === null) return null
    const data = payload as Record<string, unknown>
    if (typeof data.workbenchId !== "string" || !data.workbenchId) return null
    return { workbenchId: data.workbenchId, taskId: typeof data.taskId === "string" && data.taskId ? data.taskId : null }
}

/** Consultas `["agentic", tipo, id]` ligadas a uma mesa: por tarefa (`workbench`) ou pelo id da mesa. */
const BY_TASK = new Set(["workbench"])
const BY_WORKBENCH = new Set(["forks", "builds"])

/**
 * A mesa em fila (vaga ou build) mostra a posição, que muda quando OUTRA mesa avança/libera: ela
 * continua sendo refeita a cada evento.
 */
function waitsInQueue(data: unknown): boolean {
    if (typeof data !== "object" || data === null) return false
    const workbench = data as { slotQueue?: unknown; buildQueuePosition?: unknown }
    return (workbench.slotQueue !== null && workbench.slotQueue !== undefined) || typeof workbench.buildQueuePosition === "number"
}

/** `data`: o que a consulta tem no cache (a mesa por tarefa em fila não conta como "de outra mesa"). */
export function isOtherWorkbenchQuery(queryKey: readonly unknown[], target: WorkbenchEventTarget, data?: unknown): boolean {
    const [, kind, id] = queryKey
    if (typeof kind !== "string" || typeof id !== "string") return false
    if (BY_TASK.has(kind)) return target.taskId !== null && id !== target.taskId && !waitsInQueue(data)
    if (BY_WORKBENCH.has(kind)) return id !== target.workbenchId
    return false
}
