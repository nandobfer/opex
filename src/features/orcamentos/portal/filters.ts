import type { UrlFilterSchema } from "@/hooks/useUrlFilters"
import { urlFilterCodecs } from "@/hooks/useUrlFilters"
import { currentMonth, financeQueryRange, normalizeIds } from "@/features/finance/filters"

/**
 * Filtros da tela Financeiro do **portal** (na URL): período e repositórios. Módulo **puro**, no
 * mesmo padrão do Financeiro do dono — período em `yyyy-MM-dd` e repositórios multisseleção. Não há
 * filtro de clientes: o cliente já é o da sessão.
 */

export interface ClienteFinanceFilters {
    /** Início do período em `yyyy-MM-dd` (vazio = sem limite). */
    from: string
    /** Fim do período em `yyyy-MM-dd` (vazio = sem limite). */
    to: string
    /** Ids dos projetos (repositórios do cliente); vazio = todos. */
    projectIds: string[]
}

export const CLIENTE_FINANCE_FILTER_SCHEMA: UrlFilterSchema<ClienteFinanceFilters> = {
    from: urlFilterCodecs.string(),
    to: urlFilterCodecs.string(),
    projectIds: urlFilterCodecs.strings(),
}

/** Filtros padrão: **mês corrente** (dia 1 → hoje) e nenhum repositório selecionado. */
export function defaultClienteFinanceFilters(): ClienteFinanceFilters {
    return { ...currentMonth(), projectIds: [] }
}

/** Consulta normalizada (ids únicos e ordenados; período em ISO do início ao fim do dia). */
export interface ClienteFinanceQuery {
    from: string
    to: string
    projectIds: string[]
}

export function clienteFinanceQuery(filters: ClienteFinanceFilters): ClienteFinanceQuery {
    const range = financeQueryRange(filters)
    return { from: range.from, to: range.to, projectIds: normalizeIds(filters.projectIds) }
}

/** Parâmetros HTTP da consulta; lista vazia vira `undefined` (sem filtro). */
export function clienteFinanceHttpParams(query: ClienteFinanceQuery): Record<string, string | undefined> {
    return {
        from: query.from || undefined,
        to: query.to || undefined,
        projectIds: query.projectIds.length ? query.projectIds.join(",") : undefined,
    }
}

/** Há repositório selecionado? (o vazio da tela muda de mensagem.) */
export function hasClienteRepoFilter(filters: Pick<ClienteFinanceFilters, "projectIds">): boolean {
    return filters.projectIds.length > 0
}
