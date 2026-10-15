import { dbConnect } from "@/lib/db"
import { AuditLog } from "@/lib/db/models/AuditLog"
import { DevTask } from "@/lib/db/models/DevTask"
import { Project } from "@/lib/db/models/Project"
import { TaskBoardColumn } from "@/lib/db/models/TaskBoard"
import { completionTimestamps } from "@/features/finance/logic"
import { listServiceAggregates } from "@/features/services/server/service"
import { TASK_AUDIT_ENTITY, concludedColumnKeys } from "@/features/tasks/server/service"
import type { ClienteCostGroupDto, ClienteFinanceDto } from "../types"

/**
 * Financeiro do **cliente** (SOMENTE servidor): custo das tarefas concluídas **e dos serviços**,
 * **agrupado por repositório**. Reusa as regras do Financeiro do dono (snapshot), mas nunca expõe
 * horas reais, fator, custo/hora ou modelo. O serviço sem repositório cai em "Sem repositório".
 */

export interface CostTaskInput {
    /** Discriminador: tarefa concluída ou serviço criado manualmente. */
    kind: "task" | "service"
    id: string
    code: string
    title: string
    projectId: string | null
    repo: string | null
    clientHours: number
    costBrl: number
    /** Data efetiva (conclusão da tarefa ou data do serviço). */
    completedAt: number
}

interface ProjectInfo {
    id: string
    repo: string
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/** Agrupa tarefas concluídas e serviços por repositório, com totais (puro, testável sem banco). */
export function groupCostByProject(tasks: readonly CostTaskInput[], projectsById: ReadonlyMap<string, ProjectInfo>, range: { from: string | null; to: string | null }): ClienteFinanceDto {
    const groups = new Map<string, ClienteCostGroupDto>()

    for (const task of tasks) {
        const key = task.projectId ?? "__sem__"
        const repo = task.projectId ? (projectsById.get(task.projectId)?.repo ?? "Repositório removido") : "Sem repositório"
        let group = groups.get(key)
        if (!group) {
            group = { projectId: task.projectId, repo, taskCount: 0, serviceCount: 0, totalClientHours: 0, totalCostBrl: 0, tasks: [] }
            groups.set(key, group)
        }
        group.tasks.push({ id: task.id, kind: task.kind, code: task.code, title: task.title, repo: task.projectId ? repo : null, projectId: task.projectId, clientHours: task.clientHours, costBrl: task.costBrl, completedAt: new Date(task.completedAt).toISOString() })
    }

    const list = [...groups.values()].map((group) => ({
        ...group,
        taskCount: group.tasks.filter((task) => task.kind === "task").length,
        serviceCount: group.tasks.filter((task) => task.kind === "service").length,
        totalClientHours: round2(group.tasks.reduce((sum, task) => sum + task.clientHours, 0)),
        totalCostBrl: round2(group.tasks.reduce((sum, task) => sum + task.costBrl, 0)),
        tasks: [...group.tasks].sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1)),
    }))
    list.sort((a, b) => b.totalCostBrl - a.totalCostBrl || a.repo.localeCompare(b.repo))

    return {
        from: range.from,
        to: range.to,
        groups: list,
        totals: {
            taskCount: list.reduce((sum, group) => sum + group.taskCount, 0),
            serviceCount: list.reduce((sum, group) => sum + group.serviceCount, 0),
            totalClientHours: round2(list.reduce((sum, group) => sum + group.totalClientHours, 0)),
            totalCostBrl: round2(list.reduce((sum, group) => sum + group.totalCostBrl, 0)),
        },
    }
}

/** Tarefas concluídas do cliente no período (conclusão derivada da auditoria). */
async function collectClientTasks(clientId: string, range: { from: string | null; to: string | null; projectIds?: readonly string[] }): Promise<{ id: string; code: string; title: string; projectId: string; clientHours: number; costBrl: number; completedAt: number }[]> {
    const closedKeys = await concludedColumnKeys()
    if (closedKeys.length === 0) return []

    const columns = await TaskBoardColumn.find({ key: { $in: closedKeys } })
        .select({ key: 1, name: 1 })
        .lean()
    const nameToKey = new Map(columns.map((column) => [column.name, column.key]))

    const filter: Record<string, unknown> = { clientId, columnId: { $in: closedKeys }, archived: { $ne: true }, estimate: { $ne: null } }
    if (range.projectIds && range.projectIds.length > 0) filter.projectId = { $in: [...range.projectIds] }

    const candidates = await DevTask.find(filter).lean()
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

    return candidates
        .filter((task) => {
            const completedAt = completed.get(String(task._id))
            if (completedAt === undefined) return false
            if (fromMs !== null && completedAt < fromMs) return false
            if (toMs !== null && completedAt > toMs) return false
            return true
        })
        .map((task) => ({
            id: String(task._id),
            code: task.code,
            title: task.title,
            projectId: task.projectId,
            clientHours: task.estimate?.clientHours ?? 0,
            costBrl: task.estimate?.billingBrl ?? 0,
            completedAt: completed.get(String(task._id))!,
        }))
}

/** Custo das tarefas concluídas **e dos serviços** do cliente por repositório, no período. */
export async function listClientCost(clientId: string, range: { from: string | null; to: string | null; projectIds?: readonly string[] }): Promise<ClienteFinanceDto> {
    await dbConnect()
    const [tasks, services] = await Promise.all([
        collectClientTasks(clientId, range),
        listServiceAggregates({ from: range.from, to: range.to, clientIds: [clientId], projectIds: range.projectIds }),
    ])

    if (tasks.length === 0 && services.length === 0) return groupCostByProject([], new Map(), range)

    const projectIds = [...new Set([...tasks.map((task) => task.projectId), ...services.map((service) => service.projectId).filter((id): id is string => Boolean(id))])]
    const projects = await Project.find({ _id: { $in: projectIds } })
        .select({ repo: 1 })
        .lean()
    const projectsById = new Map(projects.map((project) => [String(project._id), { id: String(project._id), repo: project.repo }]))

    const inputs: CostTaskInput[] = [
        ...tasks.map((task) => ({ kind: "task" as const, ...task, repo: projectsById.get(task.projectId)?.repo ?? null })),
        ...services.map((service) => ({
            kind: "service" as const,
            id: service.id,
            code: service.code,
            title: service.title,
            projectId: service.projectId,
            repo: service.project?.repo ?? null,
            clientHours: service.clientHours,
            costBrl: service.billingBrl,
            completedAt: service.serviceDate,
        })),
    ]

    return groupCostByProject(inputs, projectsById, range)
}
