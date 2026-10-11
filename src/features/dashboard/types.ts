import type { ColumnColor } from "@/features/tasks/board"
import type { TaskType } from "@/features/tasks/constants"

/**
 * Contratos da tela **Dashboards** (`/dashboard`). Módulo puro (cliente e servidor): o servidor monta
 * o `DashboardDto` a partir das consultas de banco e o cliente só o desenha. O período é único para
 * toda a tela (`from`/`to` ISO) e o **fuso** (`timeZone`, IANA) define os buckets diário/semanal/mensal.
 */

/** Faixa efetiva do período (ISO). Sem `from`/`to` no pedido, o servidor assume os últimos 30 dias. */
export interface DashboardRange {
    from: string | null
    to: string | null
}

/** Indicadores de topo. Mistura instantâneos (mesas/quadro) e do período (conclusão/faturamento/horas). */
export interface DashboardKpis {
    /** Tarefas não arquivadas. */
    tasksActive: number
    /** Tarefas não arquivadas fora das colunas de conclusão. */
    tasksInProgress: number
    /** Tarefas cuja conclusão (auditoria) caiu no período. */
    tasksCompleted: number
    /** Faturamento (snapshot) das tarefas concluídas no período. */
    billingBrl: number
    /** Horas do cliente (H × fator) das tarefas concluídas no período. */
    clientHours: number
    /** Minutos apontados no período. */
    loggedMinutes: number
    /** Custo de IA em dólares no período. */
    costUsd: number
    /** Mesas de trabalho não concluídas (instantâneo). */
    activeWorkbenches: number
    /** Mesas executando agora (instantâneo). */
    runningWorkbenches: number
}

export interface DashboardColumnSlice {
    key: string
    label: string
    color: ColumnColor
    count: number
}

export interface DashboardTypeSlice {
    type: TaskType | "none"
    count: number
}

export interface DashboardProjectSlice {
    projectId: string
    name: string
    sigla: string
    count: number
}

export interface DashboardTimelinePoint {
    bucket: string
    created: number
    completed: number
}

export interface DashboardFinanceClient {
    clientId: string | null
    clientName: string
    billingBrl: number
    clientHours: number
    taskCount: number
}

export interface DashboardFinancePoint {
    bucket: string
    billingBrl: number
}

export interface DashboardTimePoint {
    bucket: string
    minutes: number
    costUsd: number
}

export interface DashboardCostProject {
    projectId: string
    name: string
    sigla: string
    minutes: number
    costUsd: number
}

export interface DashboardStageSlice {
    stage: string
    label: string
    minutes: number
}

export interface DashboardModelSlice {
    model: string
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
    totalTokens: number
}

export interface DashboardFunnelStep {
    step: string
    label: string
    count: number
}

export interface DashboardWorkbenchProject {
    projectId: string
    name: string
    sigla: string
    count: number
}

export interface DashboardWorkbenchCost {
    projectId: string
    name: string
    sigla: string
    costUsd: number
}

export interface DashboardDto {
    range: DashboardRange
    kpis: DashboardKpis
    tasksByColumn: DashboardColumnSlice[]
    tasksByType: DashboardTypeSlice[]
    tasksByProject: DashboardProjectSlice[]
    tasksTimeline: DashboardTimelinePoint[]
    financeByClient: DashboardFinanceClient[]
    financeTimeline: DashboardFinancePoint[]
    timeByDay: DashboardTimePoint[]
    costByProject: DashboardCostProject[]
    timeByStage: DashboardStageSlice[]
    tokensByModel: DashboardModelSlice[]
    workbenchFunnel: DashboardFunnelStep[]
    workbenchByProject: DashboardWorkbenchProject[]
    workbenchCostByProject: DashboardWorkbenchCost[]
}
