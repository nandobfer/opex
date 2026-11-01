"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { MemoryConsumer } from "../agents"
import type { SelfMemorySettings } from "../self-memory"

type SelfMemoryDto = { settings: SelfMemorySettings; updatedAt: string | null }
const KEY = ["ai", "self-memory"] as const

/** "Aprendizado autônomo" por agente, com troca otimista (falha volta e avisa). */
export function useSelfMemorySettings() {
    const queryClient = useQueryClient()
    const query = useQuery({ queryKey: KEY, queryFn: async () => unwrapApi((await api.get<ApiResponse<SelfMemoryDto>>("/ai/features/agent-self-memory")).data) })
    const mutation = useMutation({
        mutationFn: async (settings: SelfMemorySettings) => unwrapApi((await api.put<ApiResponse<SelfMemoryDto>>("/ai/features/agent-self-memory", settings)).data),
        onMutate: async (settings) => {
            await queryClient.cancelQueries({ queryKey: KEY })
            const previous = queryClient.getQueryData<SelfMemoryDto>(KEY)
            if (previous) queryClient.setQueryData<SelfMemoryDto>(KEY, { ...previous, settings })
            return { previous }
        },
        onError: (error, _settings, context) => {
            if (context?.previous) queryClient.setQueryData(KEY, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível salvar o aprendizado autônomo"))
        },
        onSuccess: (data) => queryClient.setQueryData(KEY, data),
    })
    const set = (consumer: MemoryConsumer, value: boolean) => {
        const current = query.data?.settings
        if (current) mutation.mutate({ ...current, [consumer]: value })
    }
    return { query, settings: query.data?.settings ?? null, set, saving: mutation.isPending }
}
