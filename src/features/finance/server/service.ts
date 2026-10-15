import { dbConnect } from "@/lib/db"
import { AuditLog } from "@/lib/db/models/AuditLog"
import { DevTask } from "@/lib/db/models/DevTask"
import { OrcamentoClient } from "@/lib/db/models/Orcamento"
import { Project } from "@/lib/db/models/Project"
import { TaskBoardColumn } from "@/lib/db/models/TaskBoard"
import { TASK_AUDIT_ENTITY, concludedColumnKeys } from "@/features/tasks/server/service"
import { listServiceAggregates } from "@/features/services/server/service"
import { aggregateFinance, completionTimestamps, type FinanceItemInput, type FinanceServiceInput, type FinanceTaskInput } from "../logic"
import type { FinanceByClientDto, FinanceTotalsDto } from "../types"

/**
 * Financeiro (SOMENTE servidor): faturamento **das tarefas concluídas e dos serviços** agrupado por
 * cliente. O valor da tarefa é o snapshot `estimate.billingBrl` (conclusão derivada da auditoria); o
 * do serviço é o próprio snapshot, com a data em `serviceDate`. Serviços entram **mesmo** sem
 * colunas de conclusão nem tarefas no período.
 */

export interface FinanceFilterRange {
    from?: string | null
    to?: string | null
    clientIds?: readonly string[]
    projectIds?: readonly string[]
    /** Inclui serviços arquivados na lista (fora dos totais). */
    includeArchived?: boolean
}

const emptyTotals = (): FinanceTotalsDto => ({ taskCount: 0, serviceCount: 0, totalHours: 0, totalClientHours: 0, totalBillingBrl: 0 })

/** Tarefas concluídas no período (conclusão por auditoria; snapshot do faturamento). */
async function collectTaskItems(range: { from: string | null; to: string | null; clientIds: readonly string[]; projectIds: readonly string[] }): Promise<FinanceTaskInput[]> {
    const closedKeys = await concludedColumnKeys()
    if (closedKeys.length === 0) return []

    const columns = await TaskBoardColumn.find({ key: { $in: closedKeys } })
        .select({ key: 1, name: 1 })
        .lean()
    const nameToKey = new Map(columns.map((column) => [column.name, column.key]))

    const candidateFilter: Record<string, unknown> = {
        columnId: { $in: closedKeys },
        archived: { $ne: true },
        clientId: { $ne: null },
        estimate: { $ne: null },
    }
    if (range.clientIds.length > 0) candidateFilter.clientId = { $in: [...range.clientIds] }
    if (range.projectIds.length > 0) candidateFilter.projectId = { $in: [...range.projectIds] }

    const candidates = await DevTask.find(candidateFilter).lean()
    if (candidates.length === 0) return []

    const ids = candidates.map((task) => String(task._id))
    const logs = await AuditLog.find({
        entidade: TASK_AUDIT_ENTITY,
        entidadeId: { $in: ids },
        acao: { $in: ["MOVER", "ATUALIZAR"] },
        ...(range.to ? { timestamp: { $lte: new Date(range.to) } } : {}),
    })
        .select({ entidadeId: 1, acao: 1, dadosNovos: 1, timestamp: 1 })
        .lean()

    const completed = completionTimestamps(logs, new Set(closedKeys), nameToKey)
    const fromMs = range.from ? new Date(range.from).getTime() : null
    const toMs = range.to ? new Date(range.to).getTime() : null

    const kept = candidates.filter((task) => {
        const completedAt = completed.get(String(task._id))
        if (completedAt === undefined) return false
        if (fromMs !== null && completedAt < fromMs) return false
        if (toMs !== null && completedAt > toMs) return false
        return true
    })
    if (kept.length === 0) return []

    const projects = await Project.find({ _id: { $in: [...new Set(kept.map((task) => task.projectId))] } }).lean()
    const projectsById = new Map(projects.map((project) => [String(project._id), project]))

    const items: FinanceTaskInput[] = []
    for (const task of kept) {
        if (!task.clientId) continue
        const project = projectsById.get(task.projectId) ?? null
        items.push({
            kind: "task",
            id: String(task._id),
            code: task.code,
            title: task.title,
            project: project ? { id: String(project._id), name: project.name, repo: project.repo, sigla: project.sigla } : null,
            clientId: task.clientId,
            hours: task.estimate?.hours ?? 0,
            clientHours: task.estimate?.clientHours ?? 0,
            billingBrl: task.estimate?.billingBrl ?? 0,
            completedAt: completed.get(String(task._id))!,
        })
    }
    return items
}

export async function listFinanceByClient(range: FinanceFilterRange): Promise<FinanceByClientDto> {
    const from = range.from ?? null
    const to = range.to ?? null
    const clientIds = range.clientIds ?? []
    const projectIds = range.projectIds ?? []
    await dbConnect()

    const [taskItems, serviceRows] = await Promise.all([
        collectTaskItems({ from, to, clientIds, projectIds }),
        listServiceAggregates({ from, to, clientIds, projectIds, includeArchived: range.includeArchived }),
    ])

    const serviceItems: FinanceServiceInput[] = serviceRows.map((row) => ({
        kind: "service",
        id: row.id,
        code: row.code,
        title: row.title,
        project: row.project,
        clientId: row.clientId,
        hours: row.hours,
        clientHours: row.clientHours,
        billingBrl: row.billingBrl,
        serviceDate: row.serviceDate,
        taskId: row.taskId,
        archived: row.archived,
    }))

    const items: FinanceItemInput[] = [...taskItems, ...serviceItems]
    if (items.length === 0) return { from, to, groups: [], totals: emptyTotals() }

    const clients = await OrcamentoClient.find({ _id: { $in: [...new Set(items.map((item) => item.clientId))] } })
        .select({ name: 1 })
        .lean()
    const clientsById = new Map(clients.map((client) => [String(client._id), client.name]))

    return aggregateFinance(items, clientsById, { from, to })
}
