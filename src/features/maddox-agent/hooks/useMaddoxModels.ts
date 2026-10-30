"use client"

import { useQuery } from "@tanstack/react-query"
import { unwrapApi } from "@/lib/api"
import type { AiModelDto } from "@/lib/ai/providers"
import type { ApiResponse } from "@/lib/types/api"
import { useOpexScope } from "@/features/opex-agent/components/OpexScopeProvider"

/** Catálogo do OpenCode pela rota do escopo (dono ou portal), para o seletor de modelo da sessão. */
export const useMaddoxModels = (enabled = true) => {
    const { http, apiBase, queryPrefix } = useOpexScope()
    return useQuery({
        queryKey: [queryPrefix, "models"],
        queryFn: async () => unwrapApi((await http.get<ApiResponse<AiModelDto[]>>(`${apiBase}/models`)).data),
        enabled,
        staleTime: 2 * 60_000,
        retry: false,
    })
}
