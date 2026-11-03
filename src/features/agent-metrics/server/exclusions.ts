import { AgenticWorkbench } from "@/lib/db/models/Agentic"
import { AgentRun } from "@/lib/db/models/AgentMetrics"
import { DevTask } from "@/lib/db/models/DevTask"

/** Filtro das execuções que contam nas métricas (mesa excluída e tarefa arquivada ou excluída saem). */
export const COUNTED_RUN = { excluded: { $ne: true } } as const

/**
 * Decide, a partir das referências das execuções, quais mesas e tarefas deixaram de valer (função pura):
 * mesa que não existe mais e tarefa arquivada ou excluída.
 */
export function hiddenReferences(
    refs: { workbenchIds: readonly string[]; taskIds: readonly string[] },
    existing: { workbenchIds: ReadonlySet<string>; tasks: ReadonlyMap<string, { archived: boolean }> },
): { workbenchIds: string[]; taskIds: string[] } {
    return {
        workbenchIds: refs.workbenchIds.filter((id) => !existing.workbenchIds.has(id)),
        taskIds: refs.taskIds.filter((id) => {
            const task = existing.tasks.get(id)
            return !task || task.archived
        }),
    }
}

const isObjectId = (id: string) => /^[a-f0-9]{24}$/i.test(id)

/**
 * Reconcilia `agent_runs` com as mesas e tarefas atuais: marca `excluded` nas execuções de mesa
 * excluída ou de tarefa arquivada/excluída e desmarca quando a tarefa volta do arquivamento. Devolve o
 * `finishedAt` mais antigo que mudou (para recalcular o resumo diário a partir dele) ou `null`.
 */
export async function reconcileExcludedRuns(): Promise<Date | null> {
    const [workbenchIds, taskIds] = await Promise.all([AgentRun.distinct("workbenchId", { workbenchId: { $ne: null } }), AgentRun.distinct("taskId", { taskId: { $ne: null } })])
    const wbIds = (workbenchIds as unknown[]).map(String)
    const tkIds = (taskIds as unknown[]).map(String)
    const [workbenches, tasks] = await Promise.all([
        wbIds.length ? AgenticWorkbench.find({ _id: { $in: wbIds.filter(isObjectId) } }).select({ _id: 1 }).lean() : [],
        tkIds.length ? DevTask.find({ _id: { $in: tkIds.filter(isObjectId) } }).select({ archived: 1 }).lean() : [],
    ])
    const hidden = hiddenReferences(
        { workbenchIds: wbIds, taskIds: tkIds },
        {
            workbenchIds: new Set(workbenches.map((doc) => String(doc._id))),
            tasks: new Map(tasks.map((doc) => [String(doc._id), { archived: Boolean((doc as { archived?: boolean }).archived) }])),
        },
    )
    const hiddenMatch = { $or: [{ workbenchId: { $in: hidden.workbenchIds } }, { taskId: { $in: hidden.taskIds } }] }
    const toExclude = { excluded: { $ne: true }, ...hiddenMatch }
    const toRestore = { excluded: true, workbenchId: { $nin: hidden.workbenchIds }, taskId: { $nin: hidden.taskIds } }
    const [firstExclude, firstRestore] = await Promise.all([
        AgentRun.findOne(toExclude).sort({ finishedAt: 1 }).select({ finishedAt: 1 }).lean(),
        AgentRun.findOne(toRestore).sort({ finishedAt: 1 }).select({ finishedAt: 1 }).lean(),
    ])
    if (firstExclude) await AgentRun.updateMany(toExclude, { $set: { excluded: true } })
    if (firstRestore) await AgentRun.updateMany(toRestore, { $set: { excluded: false } })
    const dates = [firstExclude?.finishedAt, firstRestore?.finishedAt].filter((value): value is Date => Boolean(value)).map((value) => new Date(value).getTime())
    return dates.length ? new Date(Math.min(...dates)) : null
}
