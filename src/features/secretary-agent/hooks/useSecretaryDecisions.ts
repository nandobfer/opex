"use client"

import { useInfiniteQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { EVOLUTION_QUERY_KEY } from "@/features/evolution-api/constants"
import type { DecisionListParams } from "../decision-filters"
import type { DecisionPageDto } from "../types"

/**
 * Registro de decisões paginado (aba Decisões). A chave começa por `/secretary/`: os eventos do Secretário que a
 * aba já escuta (`secretary-decision-recorded`) recarregam a lista.
 */
export function useSecretaryDecisions(params: DecisionListParams) {
    return useInfiniteQuery({
        queryKey: [EVOLUTION_QUERY_KEY, "/secretary/decisions", params],
        queryFn: async ({ pageParam }) => (await api.get<{ data: DecisionPageDto }>("/secretary/decisions", { params: { ...params, page: pageParam } })).data.data,
        initialPageParam: 1,
        getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
        staleTime: 10_000,
    })
}
