"use client"

import { useQuery } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { InstanceInfoDto } from "@/lib/types/instance"

export const instanceInfoKey = ["instance-info"] as const

/** Se esta instância é uma prévia do Opex (OPE-147). Não muda com o processo vivo: lida uma vez. */
export function useInstanceInfo() {
    return useQuery({
        queryKey: instanceInfoKey,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<InstanceInfoDto>>("/instance")).data),
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        retry: 1,
    })
}
