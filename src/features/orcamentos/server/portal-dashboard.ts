import { dbConnect } from "@/lib/db"
import { DevTask } from "@/lib/db/models/DevTask"
import { TaskBoardColumn } from "@/lib/db/models/TaskBoard"
import type { ClienteDashboardDto } from "../types"
import { listClientCost } from "./portal-finance"

/**
 * Dashboard do **cliente** (SOMENTE servidor): KPIs de tarefas do cliente no período e, apenas para
 * o **admin** do cliente, o bloco de **custo**. Nunca inclui horas agênticas, custo de IA nem mesas
 * de trabalho (dados internos do dono).
 */

export interface ClientDashboardRange {
    from: string
    to: string
}

const OTHER = "__other__"

function tally<T extends string>(values: readonly (T | null)[], keyOf: (value: T | null) => string): Map<string, number> {
    const map = new Map<string, number>()
    for (const value of values) {
        const key = keyOf(value)
        map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
}

/** KPIs de tarefas do cliente (e o custo, só para o admin). */
export async function buildClientDashboard(clientId: string, range: ClientDashboardRange, isAdmin: boolean): Promise<ClienteDashboardDto> {
    await dbConnect()
    const fromMs = new Date(range.from).getTime()
    const toMs = new Date(range.to).getTime()

    const [tasks, columns, cost] = await Promise.all([
        DevTask.find({ clientId, archived: { $ne: true } })
            .select({ columnId: 1, priority: 1, taskType: 1, createdAt: 1 })
            .lean(),
        TaskBoardColumn.find().select({ key: 1, name: 1 }).lean(),
        listClientCost(clientId, { from: range.from, to: range.to }),
    ])

    const columnLabels = new Map(columns.map((column) => [column.key, column.name]))
    const tasksCreated = tasks.filter((task) => {
        const created = task.createdAt ? new Date(task.createdAt).getTime() : 0
        return created >= fromMs && created <= toMs
    }).length

    const byColumnMap = tally(tasks.map((task) => task.columnId), (key) => key ?? OTHER)
    const byPriorityMap = tally(tasks.map((task) => task.priority), (key) => key ?? OTHER)
    const byTypeMap = tally(tasks.map((task) => task.taskType), (key) => key ?? OTHER)

    return {
        range,
        tasksCreated,
        tasksActive: tasks.length,
        tasksCompleted: cost.totals.taskCount,
        byColumn: [...byColumnMap.entries()].map(([key, count]) => ({ key, label: columnLabels.get(key) ?? key, count })).sort((a, b) => b.count - a.count),
        byPriority: [...byPriorityMap.entries()].map(([priority, count]) => ({ priority, count })),
        byType: [...byTypeMap.entries()].map(([type, count]) => ({ type: type === OTHER ? null : type, count })),
        cost: isAdmin ? { totalCostBrl: cost.totals.totalCostBrl, totalClientHours: cost.totals.totalClientHours, completedTasks: cost.totals.taskCount } : null,
    }
}
