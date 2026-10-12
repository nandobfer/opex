import { AuditLog } from "@/lib/db/models/AuditLog"
import { DevTask } from "@/lib/db/models/DevTask"
import { Project } from "@/lib/db/models/Project"
import { TaskBoardColumn, TaskBoardLayout } from "@/lib/db/models/TaskBoard"
import { dbConnect } from "@/lib/db"
import { aggregateTasks, buildTaskTimeline, bucketMode, type ColumnInfo, type ProjectInfo, type TaskAggInput } from "@/features/dashboard/logic"
import { completionTimestamps } from "@/features/finance/logic"
import { COLUMN_COLORS, normalizeLayout, type ColumnColor } from "@/features/tasks/board"
import { TASK_TYPES, type TaskType } from "@/features/tasks/constants"
import { concludedColumnKeys, TASK_AUDIT_ENTITY } from "@/features/tasks/server/service"
import type { ClienteDashboardDto } from "../types"
import { aggregateClienteTags, summarizeClienteFinance } from "./portal-aggregate"
import { listClientCost } from "./portal-finance"
import { resolveTagViews } from "./tag-views"

/**
 * Dashboard do **cliente** (SOMENTE servidor): o mesmo recorte de tarefas do dashboard do dono
 * (distribuição por coluna, por projeto e criadas × concluídas), com **tags** no lugar do tipo, e o
 * bloco financeiro (custo e horas infladas por repositório) apenas para o **admin** do cliente.
 * Nunca inclui horas agênticas, custo de IA, mesas de trabalho nem dados internos do dono.
 */

export interface ClientDashboardRange {
    from: string
    to: string
}

const colorOf = (value: string): ColumnColor => ((COLUMN_COLORS as readonly string[]).includes(value) ? (value as ColumnColor) : "zinc")
const typeOf = (value: string | null): TaskType | null => (value && (TASK_TYPES as readonly string[]).includes(value) ? (value as TaskType) : null)

interface RawTask {
    _id: unknown
    columnId: string
    taskType: string | null
    projectId: string
    tags?: string[]
    createdAt?: Date | null
}

/** Dashboard do cliente: distribuições de tarefas, série do período, tags e (admin) o financeiro. */
export async function buildClientDashboard(clientId: string, range: ClientDashboardRange, isAdmin: boolean, timeZone = "UTC"): Promise<ClienteDashboardDto> {
    await dbConnect()
    const fromMs = new Date(range.from).getTime()
    const toMs = new Date(range.to).getTime()
    const fromDate = new Date(fromMs)
    const toDate = new Date(toMs)
    const mode = bucketMode(fromMs, toMs)

    const closedKeys = await concludedColumnKeys()
    const closedSet = new Set(closedKeys)

    const [taskDocs, columnDocs, layoutDoc, projectDocs, finance] = await Promise.all([
        DevTask.find({ clientId, archived: { $ne: true } }).select({ columnId: 1, taskType: 1, projectId: 1, tags: 1, createdAt: 1 }).lean(),
        TaskBoardColumn.find({}).select({ key: 1, name: 1, color: 1 }).lean(),
        TaskBoardLayout.findOne({ key: "board" }).lean(),
        Project.find({}).select({ name: 1, sigla: 1 }).lean(),
        listClientCost(clientId, { from: range.from, to: range.to }),
    ])

    const tasks = taskDocs as unknown as RawTask[]

    // Rótulos das tags resolvidos no servidor (o portal não acessa a configuração de IA).
    const tagIds = [...new Set(tasks.flatMap((task) => task.tags ?? []))]
    const tagLabels = new Map((await resolveTagViews(tagIds)).map((tag) => [tag.id, tag.label]))

    const projectsById = new Map<string, ProjectInfo>(
        projectDocs.map((project) => {
            const id = String((project as unknown as { _id: unknown })._id)
            return [id, { id, name: project.name, sigla: project.sigla }]
        }),
    )

    const columnsByKey = new Map(columnDocs.map((column) => [column.key, column]))
    const orderedKeys = normalizeLayout(layoutDoc?.order ?? [], columnDocs.map((column) => column.key))
    const columns: ColumnInfo[] = orderedKeys.map((key) => {
        const column = columnsByKey.get(key)
        return { key, name: column?.name ?? key, color: colorOf(column?.color ?? "zinc") }
    })

    // Conclusão derivada da auditoria (mesma regra do dashboard do dono e do Financeiro).
    const closedTasks = tasks.filter((task) => closedSet.has(task.columnId))
    const nameToKey = new Map(columnDocs.map((column) => [column.name, column.key]))
    const auditLogs = closedTasks.length
        ? await AuditLog.find({
              entidade: TASK_AUDIT_ENTITY,
              entidadeId: { $in: closedTasks.map((task) => String(task._id)) },
              acao: { $in: ["MOVER", "ATUALIZAR"] },
              timestamp: { $lte: toDate },
          })
              .select({ entidadeId: 1, acao: 1, dadosNovos: 1, timestamp: 1 })
              .lean()
        : []
    const completedAt = completionTimestamps(auditLogs, closedSet, nameToKey)

    const aggTasks: TaskAggInput[] = tasks.map((task) => ({
        id: String(task._id),
        columnId: task.columnId,
        taskType: typeOf(task.taskType),
        projectId: task.projectId,
        createdAt: task.createdAt ? new Date(task.createdAt).getTime() : null,
        completedAt: completedAt.get(String(task._id)) ?? null,
    }))

    const taskAgg = aggregateTasks(aggTasks, columns, projectsById, closedSet)
    const timeline = buildTaskTimeline(aggTasks, mode, fromMs, toMs, timeZone)
    const tasksCreated = aggTasks.filter((task) => task.createdAt != null && task.createdAt >= fromMs && task.createdAt <= toMs).length
    // A contagem de concluídas vem da auditoria (independe de a tarefa ter estimativa financeira).
    const tasksCompleted = aggTasks.filter((task) => task.completedAt != null && task.completedAt >= fromMs && task.completedAt <= toMs).length

    return {
        range: { from: fromDate.toISOString(), to: toDate.toISOString() },
        tasksCreated,
        tasksActive: aggTasks.length,
        tasksCompleted,
        byColumn: taskAgg.tasksByColumn,
        byTag: aggregateClienteTags(tasks, tagLabels),
        byProject: taskAgg.tasksByProject,
        timeline,
        finance: isAdmin ? summarizeClienteFinance(finance, fromMs, toMs, timeZone) : null,
    }
}
