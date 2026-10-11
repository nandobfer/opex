import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { AgenticCentral, AgenticWorkbench } from "@/lib/db/models/Agentic"
import { AuditLog } from "@/lib/db/models/AuditLog"
import { DevTask } from "@/lib/db/models/DevTask"
import { Project } from "@/lib/db/models/Project"
import { TaskBoardColumn, TaskBoardLayout } from "@/lib/db/models/TaskBoard"
import { TimeLog } from "@/lib/db/models/TimeLog"
import { COLUMN_COLORS, normalizeLayout, type ColumnColor } from "@/features/tasks/board"
import { TASK_TYPES, type TaskType } from "@/features/tasks/constants"
import { concludedColumnKeys, TASK_AUDIT_ENTITY } from "@/features/tasks/server/service"
import { completionTimestamps } from "@/features/finance/logic"
import { listFinanceByClient } from "@/features/finance/server/service"
import { aggregateFinanceClients, aggregateTasks, aggregateTimeLogs, aggregateWorkbenches, buildFinanceTimeline, buildTaskTimeline, bucketMode, type ColumnInfo, type ProjectInfo, type TaskAggInput, type TimeLogAggInput, type WorkbenchAggInput } from "../logic"
import type { DashboardDto, DashboardKpis } from "../types"

/**
 * Serviço da tela Dashboards — **somente leitura**. Carrega tarefas/colunas/projetos, o faturamento
 * (reutilizando o serviço Financeiro) e os apontamentos/mesas do período, e delega a agregação às
 * funções puras de `logic.ts`. Sem escrita, sem auditoria.
 */

const DAY_MS = 86_400_000
const DEFAULT_WINDOW_DAYS = 30

const colorOf = (value: string): ColumnColor => (COLUMN_COLORS as readonly string[]).includes(value) ? (value as ColumnColor) : "zinc"
const typeOf = (value: string | null): TaskType | null => (value && (TASK_TYPES as readonly string[]).includes(value) ? (value as TaskType) : null)

interface RawTask {
    _id: unknown
    columnId: string
    taskType: string | null
    projectId: string
    createdAt?: Date | null
}

export async function buildDashboard(range: { from?: string; to?: string; timeZone?: string }): Promise<DashboardDto> {
    await dbConnect()

    const now = Date.now()
    const toMs = range.to ? new Date(range.to).getTime() : now
    const fromMs = range.from ? new Date(range.from).getTime() : toMs - DEFAULT_WINDOW_DAYS * DAY_MS
    if (fromMs > toMs) throw new DomainError(400, "Período inválido: a data inicial é posterior à final.", "INVALID_RANGE")
    const timeZone = range.timeZone ?? "UTC"
    const fromDate = new Date(fromMs)
    const toDate = new Date(toMs)
    const mode = bucketMode(fromMs, toMs)

    const closedKeys = await concludedColumnKeys()
    const closedSet = new Set(closedKeys)

    const [taskDocs, columnDocs, layoutDoc, projectDocs] = await Promise.all([
        DevTask.find({ archived: { $ne: true } }).select({ columnId: 1, taskType: 1, projectId: 1, createdAt: 1 }).lean(),
        TaskBoardColumn.find({}).select({ key: 1, name: 1, color: 1 }).lean(),
        TaskBoardLayout.findOne({ key: "board" }).lean(),
        Project.find({}).select({ name: 1, sigla: 1 }).lean(),
    ])

    const projectsById = new Map<string, ProjectInfo>(projectDocs.map((project) => [String((project as unknown as { _id: unknown })._id), { id: String((project as unknown as { _id: unknown })._id), name: project.name, sigla: project.sigla }]))

    const columnsByKey = new Map(columnDocs.map((column) => [column.key, column]))
    const orderedKeys = normalizeLayout(layoutDoc?.order ?? [], columnDocs.map((column) => column.key))
    const columns: ColumnInfo[] = orderedKeys.map((key) => {
        const column = columnsByKey.get(key)
        return { key, name: column?.name ?? key, color: colorOf(column?.color ?? "zinc") }
    })

    // Conclusão derivada da auditoria (mesma regra do Financeiro).
    const closedTasks = (taskDocs as unknown as RawTask[]).filter((task) => closedSet.has(task.columnId))
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

    const tasks: TaskAggInput[] = (taskDocs as unknown as RawTask[]).map((task) => ({
        id: String(task._id),
        columnId: task.columnId,
        taskType: typeOf(task.taskType),
        projectId: task.projectId,
        createdAt: task.createdAt ? new Date(task.createdAt).getTime() : null,
        completedAt: completedAt.get(String(task._id)) ?? null,
    }))

    const taskAgg = aggregateTasks(tasks, columns, projectsById, closedSet)
    const tasksTimeline = buildTaskTimeline(tasks, mode, fromMs, toMs, timeZone)
    const tasksCompleted = tasks.filter((task) => task.completedAt != null && task.completedAt >= fromMs && task.completedAt <= toMs).length

    // Financeiro (reutiliza o serviço existente; cliente removido preservado).
    const finance = await listFinanceByClient({ from: fromDate.toISOString(), to: toDate.toISOString() })
    const financeByClient = aggregateFinanceClients(finance.groups)
    const financeTimeline = buildFinanceTimeline(finance.groups, fromMs, toMs, timeZone)

    // Horas agênticas do período.
    const timeLogs = await TimeLog.find({ startTime: { $gte: fromDate, $lte: toDate } })
        .select({ taskId: 1, stage: 1, model: 1, duration: 1, costUsd: 1, inputTokens: 1, outputTokens: 1, reasoningTokens: 1, startTime: 1 })
        .lean()
    const timeTaskIds = [...new Set(timeLogs.map((log) => log.taskId))]
    const timeTaskDocs = timeTaskIds.length ? await DevTask.find({ _id: { $in: timeTaskIds } }).select({ projectId: 1 }).lean() : []
    const projectByTask = new Map(timeTaskDocs.map((task) => [String((task as unknown as { _id: unknown })._id), task.projectId]))
    const timeInputs: TimeLogAggInput[] = timeLogs.map((log) => ({
        projectId: projectByTask.get(log.taskId) ?? null,
        stage: log.stage ?? null,
        model: log.model ?? null,
        duration: log.duration ?? null,
        costUsd: log.costUsd ?? 0,
        inputTokens: log.inputTokens ?? 0,
        outputTokens: log.outputTokens ?? 0,
        reasoningTokens: log.reasoningTokens ?? 0,
        startTime: new Date(log.startTime).getTime(),
    }))
    const timeAgg = aggregateTimeLogs(timeInputs, projectsById, mode, fromMs, toMs, timeZone)

    // Central de desenvolvimento (instantâneo; custo acumulado das mesas não é filtrado pelo período).
    const [centrals, workbenchDocs] = await Promise.all([AgenticCentral.find({}).select({ projectId: 1 }).lean(), AgenticWorkbench.find({}).select({ stage: 1, runState: 1, centralId: 1, usage: 1 }).lean()])
    const projectByCentral = new Map(centrals.map((central) => [String((central as unknown as { _id: unknown })._id), central.projectId]))
    const workbenchInputs: WorkbenchAggInput[] = workbenchDocs.map((workbench) => ({
        stage: workbench.stage,
        runState: workbench.runState,
        projectId: projectByCentral.get(workbench.centralId) ?? null,
        costUsd: workbench.usage?.costUsd ?? 0,
    }))
    const workbenchAgg = aggregateWorkbenches(workbenchInputs, projectsById)

    const kpis: DashboardKpis = {
        tasksActive: tasks.length,
        tasksInProgress: taskAgg.tasksInProgress,
        tasksCompleted,
        billingBrl: finance.totals.totalBillingBrl,
        clientHours: finance.totals.totalClientHours,
        loggedMinutes: timeAgg.loggedMinutes,
        costUsd: timeAgg.costUsd,
        activeWorkbenches: workbenchAgg.activeWorkbenches,
        runningWorkbenches: workbenchAgg.runningWorkbenches,
    }

    return {
        range: { from: fromDate.toISOString(), to: toDate.toISOString() },
        kpis,
        tasksByColumn: taskAgg.tasksByColumn,
        tasksByType: taskAgg.tasksByType,
        tasksByProject: taskAgg.tasksByProject,
        tasksTimeline,
        financeByClient,
        financeTimeline,
        timeByDay: timeAgg.timeByDay,
        costByProject: timeAgg.costByProject,
        timeByStage: timeAgg.timeByStage,
        tokensByModel: timeAgg.tokensByModel,
        workbenchFunnel: workbenchAgg.workbenchFunnel,
        workbenchByProject: workbenchAgg.workbenchByProject,
        workbenchCostByProject: workbenchAgg.workbenchCostByProject,
    }
}
