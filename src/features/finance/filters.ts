import { endOfDay, format, parseISO, startOfDay } from "date-fns"
import { urlFilterCodecs, type UrlFilterSchema } from "@/hooks/useUrlFilters"
import type { ProjectRef } from "@/features/tasks/types"

/**
 * Filtros da tela Financeiro (na URL): período, clientes e repositórios. Módulo **puro** — a
 * normalização dos ids e a montagem dos parâmetros da API ficam testáveis sem React nem banco.
 *
 * Sem seleção, cada filtro significa **todos**; dentro de um mesmo filtro as opções somam (OU) e
 * filtros diferentes se cruzam (E), sempre combinados com o período.
 */

export interface FinanceFilters {
    /** Início do período em `yyyy-MM-dd` (vazio = sem limite). */
    from: string
    /** Fim do período em `yyyy-MM-dd` (vazio = sem limite). */
    to: string
    /** Ids dos clientes (`OrcamentoClient._id`); vazio = todos. */
    clientIds: string[]
    /** Ids dos projetos (repositórios vinculados); vazio = todos. */
    projectIds: string[]
}

export const FINANCE_FILTER_SCHEMA: UrlFilterSchema<FinanceFilters> = {
    from: urlFilterCodecs.string(),
    to: urlFilterCodecs.string(),
    clientIds: urlFilterCodecs.strings(),
    projectIds: urlFilterCodecs.strings(),
}

/** Mês corrente (dia 1 → hoje), em `yyyy-MM-dd` — padrão ao abrir a tela. */
export function currentMonth(): { from: string; to: string } {
    const today = new Date()
    return { from: format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") }
}

/** Filtros padrão: mês corrente e nenhuma seleção de cliente/repositório. */
export function defaultFinanceFilters(): FinanceFilters {
    return { ...currentMonth(), clientIds: [], projectIds: [] }
}

/** Ids únicos e ordenados — assinatura estável para a chave de cache e para os parâmetros. */
export function normalizeIds(ids: readonly string[]): string[] {
    return [...new Set(ids.filter(Boolean))].sort()
}

/** Período em ISO (início/fim do dia) para a API; vazio quando o filtro está vazio. */
export function financeQueryRange(range: Pick<FinanceFilters, "from" | "to">): { from: string; to: string } {
    return {
        from: range.from ? startOfDay(parseISO(range.from)).toISOString() : "",
        to: range.to ? endOfDay(parseISO(range.to)).toISOString() : "",
    }
}

/** Parâmetros normalizados da consulta ao financeiro (chave de cache e requisição). */
export interface FinanceQueryParams {
    from: string
    to: string
    clientIds: string[]
    projectIds: string[]
}

/** Consulta normalizada a partir dos filtros da URL (ids únicos e ordenados). */
export function financeQuery(filters: FinanceFilters): FinanceQueryParams {
    return { ...financeQueryRange(filters), clientIds: normalizeIds(filters.clientIds), projectIds: normalizeIds(filters.projectIds) }
}

/** Parâmetros HTTP: listas separadas por vírgula; vazio vira `undefined` (sem filtro). */
export function financeHttpParams(query: FinanceQueryParams): Record<string, string | undefined> {
    return {
        from: query.from || undefined,
        to: query.to || undefined,
        clientIds: query.clientIds.length ? query.clientIds.join(",") : undefined,
        projectIds: query.projectIds.length ? query.projectIds.join(",") : undefined,
    }
}

/** Há filtro de cliente ou repositório ativo? */
export function hasSelectionFilters(filters: Pick<FinanceFilters, "clientIds" | "projectIds">): boolean {
    return filters.clientIds.length > 0 || filters.projectIds.length > 0
}

/** Opção do filtro Repositório: `value` é o id do projeto (o repositório vinculado). */
export interface FinanceRepoOption {
    value: string
    label: string
    project: ProjectRef
}

/** Opções do filtro Repositório (todos os projetos vinculados), ordenadas por `owner/repo`. */
export function financeRepoOptions(projects: readonly ProjectRef[]): FinanceRepoOption[] {
    return projects
        .map((project) => ({ value: project.id, label: project.repo, project }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
}

/** Opção do filtro Clientes. */
export interface FinanceClientOption {
    value: string
    label: string
}

/** Opções do filtro Clientes (inclui inativos), ordenadas por nome. */
export function financeClientOptions(clients: readonly { id: string; name: string }[]): FinanceClientOption[] {
    return clients
        .map((client) => ({ value: client.id, label: client.name }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
}
