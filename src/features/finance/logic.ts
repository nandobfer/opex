import type { ProjectRef } from "@/features/tasks/types"
import type { FinanceByClientDto, FinanceClientGroupDto, FinanceItemDto, FinanceTotalsDto } from "./types"

/**
 * Regras puras da visão Financeiro: derivação da data de conclusão a partir da auditoria e agregação
 * do faturamento por cliente (tarefas concluídas **e** serviços). Testável sem banco.
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

/** Tarefa concluída já normalizada para a agregação. */
export interface FinanceTaskInput {
    kind: "task"
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

/** Serviço já normalizado para a agregação. */
export interface FinanceServiceInput {
    kind: "service"
    id: string
    code: string
    title: string
    project: ProjectRef | null
    clientId: string
    hours: number
    clientHours: number
    billingBrl: number
    /** Data do serviço em ms. */
    serviceDate: number
    taskId: string | null
    /** Arquivado: entra na lista com o filtro ligado, mas **fora** dos totais. */
    archived?: boolean
}

export type FinanceItemInput = FinanceTaskInput | FinanceServiceInput

const REMOVED_GROUP = "__removed__"
const REMOVED_LABEL = "Cliente removido"

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/** Instante (ms) usado para ordenar e para a evolução mensal do item (conclusão ou data do serviço). */
export function financeItemTimestamp(item: FinanceItemDto): number {
    return item.kind === "service" ? new Date(item.serviceDate).getTime() : new Date(item.completedAt).getTime()
}

/** Instante (ms) do item de entrada (a tarefa tem conclusão; o serviço tem data própria). */
export function financeInputTimestamp(item: FinanceItemInput): number {
    return item.kind === "service" ? item.serviceDate : item.completedAt
}

/** Serviço arquivado: entra na lista (com o filtro ligado), mas fora das somas e contadores. */
function isArchived(item: FinanceItemInput): boolean {
    return item.kind === "service" && item.archived === true
}

function toItemDto(item: FinanceItemInput): FinanceItemDto {
    if (item.kind === "service") {
        return {
            kind: "service",
            id: item.id,
            code: item.code,
            title: item.title,
            project: item.project,
            hours: item.hours,
            clientHours: item.clientHours,
            billingBrl: item.billingBrl,
            serviceDate: new Date(item.serviceDate).toISOString(),
            taskId: item.taskId,
            archived: item.archived === true,
        }
    }
    return {
        kind: "task",
        id: item.id,
        code: item.code,
        title: item.title,
        project: item.project,
        hours: item.hours,
        clientHours: item.clientHours,
        billingBrl: item.billingBrl,
        completedAt: new Date(item.completedAt).toISOString(),
    }
}

/**
 * Agrupa tarefas e serviços por cliente e soma o faturamento do período. O cliente cujo registro não
 * existe mais cai no grupo **"Cliente removido"**. Grupos por faturamento desc (desempate por nome);
 * dentro do grupo, os itens por data desc. Serviços **arquivados** aparecem na lista, mas **não**
 * entram nos totais nem nos contadores.
 */
export function aggregateFinance(items: readonly FinanceItemInput[], clientsById: ReadonlyMap<string, string>, range: { from: string | null; to: string | null }): FinanceByClientDto {
    const groups = new Map<string, FinanceClientGroupDto>()
    for (const item of items) {
        const clientName = clientsById.get(item.clientId)
        const groupKey = clientName ? item.clientId : REMOVED_GROUP
        let group = groups.get(groupKey)
        if (!group) {
            group = { clientId: clientName ? item.clientId : null, clientName: clientName ?? REMOVED_LABEL, taskCount: 0, serviceCount: 0, totalHours: 0, totalClientHours: 0, totalBillingBrl: 0, tasks: [] }
            groups.set(groupKey, group)
        }
        group.tasks.push(toItemDto(item))
        if (!isArchived(item)) {
            if (item.kind === "task") group.taskCount += 1
            else group.serviceCount += 1
            group.totalHours += item.hours
            group.totalClientHours += item.clientHours
            group.totalBillingBrl += item.billingBrl
        }
    }

    const list = [...groups.values()]
    for (const group of list) {
        group.totalHours = round2(group.totalHours)
        group.totalClientHours = round2(group.totalClientHours)
        group.totalBillingBrl = round2(group.totalBillingBrl)
        group.tasks.sort((a, b) => financeItemTimestamp(b) - financeItemTimestamp(a) || a.code.localeCompare(b.code))
    }
    list.sort((a, b) => b.totalBillingBrl - a.totalBillingBrl || a.clientName.localeCompare(b.clientName, "pt-BR"))

    const totals: FinanceTotalsDto = {
        taskCount: list.reduce((sum, group) => sum + group.taskCount, 0),
        serviceCount: list.reduce((sum, group) => sum + group.serviceCount, 0),
        totalHours: round2(list.reduce((sum, group) => sum + group.totalHours, 0)),
        totalClientHours: round2(list.reduce((sum, group) => sum + group.totalClientHours, 0)),
        totalBillingBrl: round2(list.reduce((sum, group) => sum + group.totalBillingBrl, 0)),
    }
    return { from: range.from, to: range.to, groups: list, totals }
}
