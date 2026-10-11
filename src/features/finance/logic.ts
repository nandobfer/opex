import type { ProjectRef } from "@/features/tasks/types"
import type { FinanceByClientDto, FinanceClientGroupDto, FinanceTotalsDto } from "./types"

/**
 * Regras puras da visão Financeiro: derivação da data de conclusão a partir da auditoria e agregação
 * do faturamento por cliente. Testável sem banco.
 */

/** Evento de auditoria mínimo usado para derivar a conclusão de uma tarefa. */
export interface CompletionAuditLog {
    entidadeId: string
    acao: string
    /** `dadosNovos` da auditoria (`depois`): `coluna` é o nome (MOVER) ou a key (ATUALIZAR). */
    dadosNovos?: Record<string, unknown> | null
    timestamp: Date | string
}

/**
 * Maior timestamp (ms) em que cada tarefa foi movida **para dentro** de uma coluna de conclusão.
 * `MOVER` traz o **nome** da coluna de destino (convertido para key por `nameToKey`); `ATUALIZAR`
 * traz a **key** direto. Tarefas sem evento que entre numa coluna de conclusão ficam de fora.
 */
export function completionTimestamps(logs: readonly CompletionAuditLog[], closedKeys: ReadonlySet<string>, nameToKey: ReadonlyMap<string, string>): Map<string, number> {
    const result = new Map<string, number>()
    for (const log of logs) {
        const column = log.dadosNovos?.coluna
        if (typeof column !== "string") continue
        const key = log.acao === "MOVER" ? nameToKey.get(column) : column
        if (!key || !closedKeys.has(key)) continue
        const ts = new Date(log.timestamp).getTime()
        const current = result.get(log.entidadeId)
        if (current === undefined || ts > current) result.set(log.entidadeId, ts)
    }
    return result
}

/** Tarefa candidata já normalizada para a agregação. */
export interface FinanceTaskInput {
    id: string
    code: string
    title: string
    project: ProjectRef | null
    /** Cliente da tarefa (já filtrado sem nulo pelo serviço). */
    clientId: string
    /** Horas reais (H). */
    hours: number
    /** Horas do cliente (H × fator). */
    clientHours: number
    /** Faturamento em reais (snapshot). */
    billingBrl: number
    /** Data de conclusão em ms (derivada da auditoria). */
    completedAt: number
}

const REMOVED_GROUP = "__removed__"
const REMOVED_LABEL = "Cliente removido"

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/**
 * Agrupa as tarefas concluídas por cliente e soma o faturamento do período. O cliente cujo registro
 * não existe mais cai no grupo **"Cliente removido"**. Grupos por faturamento desc (desempate por
 * nome); dentro do grupo, as tarefas por data de conclusão desc.
 */
export function aggregateFinance(tasks: readonly FinanceTaskInput[], clientsById: ReadonlyMap<string, string>, range: { from: string | null; to: string | null }): FinanceByClientDto {
    const groups = new Map<string, FinanceClientGroupDto>()
    for (const task of tasks) {
        const clientName = clientsById.get(task.clientId)
        const groupKey = clientName ? task.clientId : REMOVED_GROUP
        let group = groups.get(groupKey)
        if (!group) {
            group = { clientId: clientName ? task.clientId : null, clientName: clientName ?? REMOVED_LABEL, taskCount: 0, totalHours: 0, totalClientHours: 0, totalBillingBrl: 0, tasks: [] }
            groups.set(groupKey, group)
        }
        group.tasks.push({
            id: task.id,
            code: task.code,
            title: task.title,
            project: task.project,
            hours: task.hours,
            clientHours: task.clientHours,
            billingBrl: task.billingBrl,
            completedAt: new Date(task.completedAt).toISOString(),
        })
        group.taskCount += 1
        group.totalHours += task.hours
        group.totalClientHours += task.clientHours
        group.totalBillingBrl += task.billingBrl
    }

    const list = [...groups.values()]
    for (const group of list) {
        group.totalHours = round2(group.totalHours)
        group.totalClientHours = round2(group.totalClientHours)
        group.totalBillingBrl = round2(group.totalBillingBrl)
        group.tasks.sort((a, b) => b.completedAt.localeCompare(a.completedAt) || a.code.localeCompare(b.code))
    }
    list.sort((a, b) => b.totalBillingBrl - a.totalBillingBrl || a.clientName.localeCompare(b.clientName, "pt-BR"))

    const totals: FinanceTotalsDto = {
        taskCount: list.reduce((sum, group) => sum + group.taskCount, 0),
        totalHours: round2(list.reduce((sum, group) => sum + group.totalHours, 0)),
        totalClientHours: round2(list.reduce((sum, group) => sum + group.totalClientHours, 0)),
        totalBillingBrl: round2(list.reduce((sum, group) => sum + group.totalBillingBrl, 0)),
    }
    return { from: range.from, to: range.to, groups: list, totals }
}
