import { dbConnect } from "@/lib/db"
import { DevTask } from "@/lib/db/models/DevTask"
import { loggerFor } from "@/lib/logger"
import { parseTaskRouteRef, taskCodeSlug } from "../route-ref"

const log = loggerFor({ feature: "tasks-route" })

export type TaskRouteResolution = { kind: "redirect"; path: string } | { kind: "render"; id: string }

export interface ResolveTaskRouteOptions {
    /** Caminho da página para o código já normalizado (ex.: `taskPath`). */
    pathFor: (code: string) => string
    /** Restringe às tarefas do cliente (portal): fora do escopo, segue como "não encontrada". */
    clientId?: string
}

/**
 * Resolve o segmento da página da tarefa (OPE-146):
 * - id existente → redireciona para o código;
 * - código existente fora do formato canônico (maiúsculas) → redireciona para a forma em minúsculas;
 * - código canônico existente → renderiza com o id (a página e a API continuam por id);
 * - inexistente, inválido ou falha do banco → renderiza com o próprio valor e a API responde
 *   `TASK_NOT_FOUND` (ou o erro), como antes.
 */
export async function resolveTaskRoute(ref: string, options: ResolveTaskRouteOptions): Promise<TaskRouteResolution> {
    const parsed = parseTaskRouteRef(ref)
    if (parsed.kind === "invalid") return { kind: "render", id: ref }
    try {
        await dbConnect()
        const task = await (parsed.kind === "id" ? DevTask.findById(parsed.id) : DevTask.findOne({ code: parsed.code }))
            .select({ code: 1, clientId: 1 })
            .lean()
        if (!task || (options.clientId !== undefined && task.clientId !== options.clientId)) return { kind: "render", id: ref }
        const slug = taskCodeSlug(task.code)
        if (parsed.kind === "id" || ref !== slug) return { kind: "redirect", path: options.pathFor(task.code) }
        return { kind: "render", id: String(task._id) }
    } catch (error) {
        log.warn({ err: error, kind: parsed.kind }, "Falha ao resolver o endereço da tarefa; segue com o valor recebido")
        return { kind: "render", id: ref }
    }
}
