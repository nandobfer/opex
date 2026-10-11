import type { ProjectRef } from "@/features/tasks/types"

/**
 * Tipos da visão Financeiro (faturamento das tarefas concluídas, agrupado por cliente). Módulo puro.
 * O valor de cada tarefa é o **snapshot** `DevTask.estimate.billingBrl` (não recalcula com fator/custo
 * atuais) e a data de conclusão é **derivada da auditoria** (ver `logic.ts`).
 */

export interface FinanceTaskDto {
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

export interface FinanceClientGroupDto {
    /** `null` = "Cliente removido" (registro do cliente não existe mais). */
    clientId: string | null
    clientName: string
    taskCount: number
    totalHours: number
    totalClientHours: number
    totalBillingBrl: number
    tasks: FinanceTaskDto[]
}

export interface FinanceTotalsDto {
    taskCount: number
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
