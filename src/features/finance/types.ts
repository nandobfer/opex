import type { ProjectRef } from "@/features/tasks/types"

/**
 * Tipos da visão Financeiro (faturamento agrupado por cliente). Módulo puro. Reúne **tarefas
 * concluídas** (valor pelo snapshot `DevTask.estimate.billingBrl`, conclusão derivada da auditoria)
 * e **serviços** criados manualmente (valor pelo snapshot do próprio serviço, data = `serviceDate`).
 */

export interface FinanceTaskDto {
    kind: "task"
    id: string
    code: string
    title: string
    /** Projeto (repositório) da tarefa, para o `GithubRepoLabel`. */
    project: ProjectRef | null
    /** Horas reais da estimativa (H). */
    hours: number
    /** Horas do cliente (H × fator). */
    clientHours: number
    /** Faturamento em reais (snapshot da estimativa). */
    billingBrl: number
    /** Data de conclusão (ISO), derivada da auditoria. */
    completedAt: string
}

/** Serviço criado manualmente (lançamento de faturamento). */
export interface FinanceServiceDto {
    kind: "service"
    id: string
    code: string
    title: string
    project: ProjectRef | null
    hours: number
    clientHours: number
    billingBrl: number
    /** Data do serviço (ISO). */
    serviceDate: string
    /** Tarefa de referência, quando houver. */
    taskId: string | null
    /** Serviço arquivado (aparece só com "Mostrar arquivados"; fora dos totais). */
    archived: boolean
}

export type FinanceItemDto = FinanceTaskDto | FinanceServiceDto

export interface FinanceClientGroupDto {
    /** `null` = "Cliente removido" (registro do cliente não existe mais). */
    clientId: string | null
    clientName: string
    taskCount: number
    /** Serviços **ativos** do grupo. */
    serviceCount: number
    totalHours: number
    totalClientHours: number
    totalBillingBrl: number
    /** Tarefas concluídas **e** serviços (arquivados aparecem aqui só com o filtro ligado). */
    tasks: FinanceItemDto[]
}

export interface FinanceTotalsDto {
    taskCount: number
    serviceCount: number
    totalHours: number
    totalClientHours: number
    totalBillingBrl: number
}

export interface FinanceByClientDto {
    from: string | null
    to: string | null
    groups: FinanceClientGroupDto[]
    totals: FinanceTotalsDto
}
