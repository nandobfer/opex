import { dbConnect } from "@/lib/db"
import { AuditLog } from "@/lib/db/models/AuditLog"
import { DevTask } from "@/lib/db/models/DevTask"
import { OrcamentoClient } from "@/lib/db/models/Orcamento"
import { Project } from "@/lib/db/models/Project"
import { TaskBoardColumn } from "@/lib/db/models/TaskBoard"
import { concludedColumnKeys, TASK_AUDIT_ENTITY } from "@/features/tasks/server/service"
import { aggregateFinance, completionTimestamps, type FinanceTaskInput } from "../logic"
import type { FinanceByClientDto, FinanceTotalsDto } from "../types"

/**
 * Visão Financeiro — faturamento das tarefas **concluídas**, agrupado por cliente. SOMENTE servidor e
 * somente leitura: o valor é o **snapshot** `DevTask.estimate.billingBrl` e a data de conclusão é
 * **derivada da auditoria** (maior evento que moveu a tarefa para uma coluna de conclusão).
 */

const emptyTotals = (): FinanceTotalsDto => ({ taskCount: 0, totalHours: 0, totalClientHours: 0, totalBillingBrl: 0 })

/** Filtros do serviço: período ISO e listas de ids (vazio/ausente = todos). */
export interface FinanceFilterRange {
    from?: string
    to?: string
    /** Ids dos clientes (`OrcamentoClient._id`). */
    clientIds?: readonly string[]
    /** Ids dos projetos (repositórios vinculados). */
    projectIds?: readonly string[]
}

export async function listFinanceByClient(range: FinanceFilterRange): Promise<FinanceByClientDto> {
    const from = range.from ?? null
    const to = range.to ?? null
    const clientIds = range.clientIds ?? []
    const projectIds = range.projectIds ?? []
    await dbConnect()

    const closedKeys = await concludedColumnKeys()
    if (closedKeys.length === 0) return { from, to, groups: [], totals: emptyTotals() }

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
    // Filtros opcionais da tela: sem seleção, todos os clientes/repositórios entram.
    if (clientIds.length > 0) candidateFilter.clientId = { $in: [...clientIds] }
    if (projectIds.length > 0) candidateFilter.projectId = { $in: [...projectIds] }

    const candidates = await DevTask.find(candidateFilter).lean()
    if (candidates.length === 0) return { from, to, groups: [], totals: emptyTotals() }

    const ids = candidates.map((task) => String(task._id))
    const logs = await AuditLog.find({
        entidade: TASK_AUDIT_ENTITY,
        entidadeId: { $in: ids },
        acao: { $in: ["MOVER", "ATUALIZAR"] },
        ...(to ? { timestamp: { $lte: new Date(to) } } : {}),
    })
        .select({ entidadeId: 1, acao: 1, dadosNovos: 1, timestamp: 1 })
        .lean()

    const completed = completionTimestamps(logs, new Set(closedKeys), nameToKey)
    const fromMs = from ? new Date(from).getTime() : null
    const toMs = to ? new Date(to).getTime() : null

    const kept = candidates.filter((task) => {
        const completedAt = completed.get(String(task._id))
        if (completedAt === undefined) return false
        if (fromMs !== null && completedAt < fromMs) return false
        if (toMs !== null && completedAt > toMs) return false
        return true
    })
    if (kept.length === 0) return { from, to, groups: [], totals: emptyTotals() }

    const [projects, clients] = await Promise.all([
        Project.find({ _id: { $in: [...new Set(kept.map((task) => task.projectId))] } }).lean(),
        OrcamentoClient.find({ _id: { $in: [...new Set(kept.map((task) => task.clientId))] } })
            .select({ name: 1 })
            .lean(),
    ])
    const projectsById = new Map(projects.map((project) => [String(project._id), project]))
    const clientsById = new Map(clients.map((client) => [String(client._id), client.name]))

    const tasks: FinanceTaskInput[] = []
    for (const task of kept) {
        if (!task.clientId) continue
        const project = projectsById.get(task.projectId) ?? null
        tasks.push({
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

    return aggregateFinance(tasks, clientsById, { from, to })
}
