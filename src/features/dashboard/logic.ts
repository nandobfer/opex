import { WORKBENCH_STEPS, WORKBENCH_STAGE_LABELS } from "@/features/agentic/constants"
import type { ColumnColor } from "@/features/tasks/board"
import { TASK_TYPES, type TaskType } from "@/features/tasks/constants"
import type {
    DashboardColumnSlice,
    DashboardCostProject,
    DashboardFinanceClient,
    DashboardFinancePoint,
    DashboardModelSlice,
    DashboardProjectSlice,
    DashboardStageSlice,
    DashboardTimePoint,
    DashboardTimelinePoint,
    DashboardTypeSlice,
    DashboardWorkbenchCost,
    DashboardWorkbenchProject,
} from "./types"

/**
 * Agregações **puras** da tela Dashboards (testáveis sem banco). O serviço carrega os documentos e
 * resolve as referências; aqui só se conta, soma e se agrupa nos buckets do período.
 *
 * Buckets: por **dia** quando o intervalo ≤ 31 dias e por **semana** (segunda a domingo) acima disso;
 * o Financeiro é sempre por **mês**. O fuso IANA define a virada de dia/semana/mês.
 */

// ── Helpers de fuso e buckets ───────────────────────────────────────────────

export type BucketMode = "day" | "week" | "month"

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function zonedFormat(timeZone: string): Intl.DateTimeFormat {
    let formatter = formatterCache.get(timeZone)
    if (!formatter) {
        formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
        formatterCache.set(timeZone, formatter)
    }
    return formatter
}

/** `YYYY-MM-DD` do instante no fuso. */
export function dayKey(ms: number, timeZone: string): string {
    const parts = zonedFormat(timeZone).formatToParts(new Date(ms))
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00"
    return `${get("year")}-${get("month")}-${get("day")}`
}

const pad = (value: number) => String(value).padStart(2, "0")

function utcMsFromDayKey(key: string): number {
    const [year, month, day] = key.split("-").map(Number)
    return Date.UTC(year!, month! - 1, day!)
}

function dayKeyFromUtcMs(ms: number): string {
    const date = new Date(ms)
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** Segunda-feira (`YYYY-MM-DD`) da semana do instante, no fuso. */
export function weekKey(ms: number, timeZone: string): string {
    const utc = utcMsFromDayKey(dayKey(ms, timeZone))
    const weekday = new Date(utc).getUTCDay() // 0 = domingo
    return dayKeyFromUtcMs(utc - ((weekday + 6) % 7) * 86_400_000)
}

/** `YYYY-MM` do instante no fuso. */
export function monthKey(ms: number, timeZone: string): string {
    return dayKey(ms, timeZone).slice(0, 7)
}

export function bucketKeyFor(ms: number, mode: BucketMode, timeZone: string): string {
    if (mode === "day") return dayKey(ms, timeZone)
    if (mode === "week") return weekKey(ms, timeZone)
    return monthKey(ms, timeZone)
}

/** Modo do bucket a partir do intervalo: ≤ 31 dias → dia; acima → semana. */
export function bucketMode(fromMs: number, toMs: number): "day" | "week" {
    return Math.round((toMs - fromMs) / 86_400_000) <= 31 ? "day" : "week"
}

function nextMonthKey(key: string): string {
    const [year, month] = key.split("-").map(Number)
    const date = new Date(Date.UTC(year!, month! - 1, 1))
    date.setUTCMonth(date.getUTCMonth() + 1)
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`
}

/** Chaves dos buckets cobrindo o intervalo (inclusive). Intervalo invertido devolve `[]`. */
export function bucketKeys(mode: BucketMode, fromMs: number, toMs: number, timeZone: string): string[] {
    if (fromMs > toMs) return []
    const keys: string[] = []
    if (mode === "month") {
        const end = monthKey(toMs, timeZone)
        let current = monthKey(fromMs, timeZone)
        let guard = 0
        while (guard++ < 500) {
            keys.push(current)
            if (current === end) break
            current = nextMonthKey(current)
        }
        return keys
    }
    const step = mode === "week" ? 7 * 86_400_000 : 86_400_000
    const startUtc = utcMsFromDayKey(mode === "week" ? weekKey(fromMs, timeZone) : dayKey(fromMs, timeZone))
    const endUtc = utcMsFromDayKey(mode === "week" ? weekKey(toMs, timeZone) : dayKey(toMs, timeZone))
    let guard = 0
    for (let cursor = startUtc; cursor <= endUtc && guard++ < 2000; cursor += step) keys.push(dayKeyFromUtcMs(cursor))
    return keys
}

// ── Tarefas ─────────────────────────────────────────────────────────────────

export interface TaskAggInput {
    id: string
    columnId: string
    taskType: TaskType | null
    projectId: string
    createdAt: number | null
    /** Conclusão (ms) derivada da auditoria; `null` quando não há evento. */
    completedAt: number | null
}

export interface ColumnInfo {
    key: string
    name: string
    color: ColumnColor
}

export interface ProjectInfo {
    id: string
    name: string
    sigla: string
}

const OTHER_PROJECT_LABEL = "Projeto removido"

const rounded = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/** Contagem por coluna (ordem do quadro informada), por tipo e por projeto. `tasks` já sem arquivadas. */
export function aggregateTasks(
    tasks: readonly TaskAggInput[],
    columns: readonly ColumnInfo[],
    projectsById: ReadonlyMap<string, ProjectInfo>,
    closedKeys: ReadonlySet<string>,
): {
    tasksByColumn: DashboardColumnSlice[]
    tasksByType: DashboardTypeSlice[]
    tasksByProject: DashboardProjectSlice[]
    tasksInProgress: number
} {
    const columnCounts = new Map<string, number>()
    const typeCounts = new Map<TaskType | "none", number>()
    const projectCounts = new Map<string, number>()
    let inProgress = 0

    for (const task of tasks) {
        columnCounts.set(task.columnId, (columnCounts.get(task.columnId) ?? 0) + 1)
        const type = task.taskType ?? "none"
        typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1)
        projectCounts.set(task.projectId, (projectCounts.get(task.projectId) ?? 0) + 1)
        if (!closedKeys.has(task.columnId)) inProgress += 1
    }

    const tasksByColumn: DashboardColumnSlice[] = []
    const knownColumns = new Set(columns.map((column) => column.key))
    for (const column of columns) {
        const count = columnCounts.get(column.key)
        if (count) tasksByColumn.push({ key: column.key, label: column.name, color: column.color, count })
    }
    for (const [key, count] of columnCounts) {
        if (!knownColumns.has(key)) tasksByColumn.push({ key, label: key, color: "zinc", count })
    }

    const tasksByType: DashboardTypeSlice[] = []
    for (const type of [...TASK_TYPES, "none"] as (TaskType | "none")[]) {
        const count = typeCounts.get(type)
        if (count) tasksByType.push({ type, count })
    }

    const tasksByProject: DashboardProjectSlice[] = [...projectCounts.entries()]
        .map(([projectId, count]) => {
            const project = projectsById.get(projectId)
            return { projectId, name: project?.name ?? OTHER_PROJECT_LABEL, sigla: project?.sigla ?? "", count }
        })
        .sort((a, b) => b.count - a.count)

    return { tasksByColumn, tasksByType, tasksByProject, tasksInProgress: inProgress }
}

/** Série criadas × concluídas nos buckets do período. */
export function buildTaskTimeline(tasks: readonly TaskAggInput[], mode: BucketMode, fromMs: number, toMs: number, timeZone: string): DashboardTimelinePoint[] {
    const points = new Map<string, DashboardTimelinePoint>()
    for (const bucket of bucketKeys(mode, fromMs, toMs, timeZone)) points.set(bucket, { bucket, created: 0, completed: 0 })
    for (const task of tasks) {
        if (task.createdAt != null) {
            const hit = points.get(bucketKeyFor(task.createdAt, mode, timeZone))
            if (hit) hit.created += 1
        }
        if (task.completedAt != null) {
            const hit = points.get(bucketKeyFor(task.completedAt, mode, timeZone))
            if (hit) hit.completed += 1
        }
    }
    return [...points.values()]
}

// ── Financeiro ───────────────────────────────────────────────────────────────

/** Converte os grupos do serviço Financeiro no recorte do dashboard (cliente removido preservado). */
export function aggregateFinanceClients(groups: readonly { clientId: string | null; clientName: string; totalBillingBrl: number; totalClientHours: number; taskCount: number }[]): DashboardFinanceClient[] {
    return groups.map((group) => ({
        clientId: group.clientId,
        clientName: group.clientName,
        billingBrl: rounded(group.totalBillingBrl),
        clientHours: rounded(group.totalClientHours),
        taskCount: group.taskCount,
    }))
}

/** Evolução mensal do faturamento a partir das tarefas concluídas por cliente. */
export function buildFinanceTimeline(
    groups: readonly { tasks: readonly { billingBrl: number; completedAt: string }[] }[],
    fromMs: number,
    toMs: number,
    timeZone: string,
): DashboardFinancePoint[] {
    const points = new Map<string, DashboardFinancePoint>()
    for (const bucket of bucketKeys("month", fromMs, toMs, timeZone)) points.set(bucket, { bucket, billingBrl: 0 })
    for (const group of groups) {
        for (const task of group.tasks) {
            const hit = points.get(bucketKeyFor(new Date(task.completedAt).getTime(), "month", timeZone))
            if (hit) hit.billingBrl = rounded(hit.billingBrl + task.billingBrl)
        }
    }
    return [...points.values()]
}

// ── Horas agênticas ──────────────────────────────────────────────────────────

export interface TimeLogAggInput {
    projectId: string | null
    stage: string | null
    model: string | null
    duration: number | null
    costUsd: number
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
    startTime: number
}

/** Horas/custo/tokens dos apontamentos do período: total, série diária/semanal, custo por projeto/etapa/modelo. */
export function aggregateTimeLogs(
    logs: readonly TimeLogAggInput[],
    projectsById: ReadonlyMap<string, ProjectInfo>,
    mode: BucketMode,
    fromMs: number,
    toMs: number,
    timeZone: string,
): {
    loggedMinutes: number
    costUsd: number
    timeByDay: DashboardTimePoint[]
    costByProject: DashboardCostProject[]
    timeByStage: DashboardStageSlice[]
    tokensByModel: DashboardModelSlice[]
} {
    const series = new Map<string, DashboardTimePoint>()
    for (const bucket of bucketKeys(mode, fromMs, toMs, timeZone)) series.set(bucket, { bucket, minutes: 0, costUsd: 0 })
    const projectTotals = new Map<string, DashboardCostProject>()
    const stageTotals = new Map<string, DashboardStageSlice>()
    const modelTotals = new Map<string, DashboardModelSlice>()
    let loggedMinutes = 0
    let costUsd = 0

    for (const log of logs) {
        const minutes = log.duration ?? 0
        loggedMinutes += minutes
        costUsd += log.costUsd

        const point = series.get(bucketKeyFor(log.startTime, mode, timeZone))
        if (point) {
            point.minutes += minutes
            point.costUsd = rounded(point.costUsd + log.costUsd)
        }

        const projectKey = log.projectId ?? ""
        const project = projectTotals.get(projectKey) ?? {
            projectId: projectKey,
            name: log.projectId ? projectsById.get(log.projectId)?.name ?? OTHER_PROJECT_LABEL : OTHER_PROJECT_LABEL,
            sigla: (log.projectId ? projectsById.get(log.projectId)?.sigla : "") ?? "",
            minutes: 0,
            costUsd: 0,
        }
        project.minutes += minutes
        project.costUsd = rounded(project.costUsd + log.costUsd)
        projectTotals.set(projectKey, project)

        const stageKey = log.stage ?? "none"
        const stage = stageTotals.get(stageKey) ?? { stage: stageKey, label: log.stage ? WORKBENCH_STAGE_LABELS[log.stage as keyof typeof WORKBENCH_STAGE_LABELS] ?? log.stage : "Sem etapa", minutes: 0 }
        stage.minutes += minutes
        stageTotals.set(stageKey, stage)

        const modelKey = log.model ?? "none"
        const model = modelTotals.get(modelKey) ?? { model: modelKey, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 }
        model.inputTokens += log.inputTokens
        model.outputTokens += log.outputTokens
        model.reasoningTokens += log.reasoningTokens
        model.totalTokens += log.inputTokens + log.outputTokens + log.reasoningTokens
        modelTotals.set(modelKey, model)
    }

    return {
        loggedMinutes,
        costUsd: rounded(costUsd),
        timeByDay: [...series.values()],
        costByProject: [...projectTotals.values()].filter((project) => project.minutes > 0 || project.costUsd > 0).sort((a, b) => b.costUsd - a.costUsd),
        timeByStage: [...stageTotals.values()].filter((stage) => stage.minutes > 0).sort((a, b) => b.minutes - a.minutes),
        tokensByModel: [...modelTotals.values()].filter((model) => model.totalTokens > 0).sort((a, b) => b.totalTokens - a.totalTokens),
    }
}

// ── Central de desenvolvimento ───────────────────────────────────────────────

export interface WorkbenchAggInput {
    stage: string
    runState: string
    projectId: string | null
    costUsd: number
}

/** Funil por passo, distribuição e custo acumulado das mesas por projeto (instantâneo, sem período). */
export function aggregateWorkbenches(
    workbenches: readonly WorkbenchAggInput[],
    projectsById: ReadonlyMap<string, ProjectInfo>,
): {
    activeWorkbenches: number
    runningWorkbenches: number
    workbenchFunnel: { step: string; label: string; count: number }[]
    workbenchByProject: DashboardWorkbenchProject[]
    workbenchCostByProject: DashboardWorkbenchCost[]
} {
    const active = workbenches.filter((workbench) => workbench.stage !== "done")
    const projectCounts = new Map<string, number>()
    const projectCosts = new Map<string, number>()
    for (const workbench of active) {
        const key = workbench.projectId ?? ""
        projectCounts.set(key, (projectCounts.get(key) ?? 0) + 1)
        projectCosts.set(key, (projectCosts.get(key) ?? 0) + workbench.costUsd)
    }

    const projectInfo = (projectId: string) => {
        const project = projectId ? projectsById.get(projectId) : undefined
        return { name: project?.name ?? OTHER_PROJECT_LABEL, sigla: project?.sigla ?? "" }
    }

    const workbenchByProject = [...projectCounts.entries()]
        .map(([projectId, count]) => ({ projectId, ...projectInfo(projectId), count }))
        .sort((a, b) => b.count - a.count)
    const workbenchCostByProject = [...projectCosts.entries()]
        .map(([projectId, costUsd]) => ({ projectId, ...projectInfo(projectId), costUsd: rounded(costUsd) }))
        .sort((a, b) => b.costUsd - a.costUsd)

    return {
        activeWorkbenches: active.length,
        runningWorkbenches: active.filter((workbench) => workbench.runState === "running").length,
        workbenchFunnel: WORKBENCH_STEPS.map((step) => ({
            step: step.id,
            label: step.label,
            count: workbenches.filter((workbench) => (step.stages as readonly string[]).includes(workbench.stage)).length,
        })),
        workbenchByProject,
        workbenchCostByProject,
    }
}
