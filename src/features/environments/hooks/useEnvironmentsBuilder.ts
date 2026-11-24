"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { ENVIRONMENTS_QUERY_KEY } from "../constants"
import type { BuilderActionInput, EnvironmentsBuilder } from "../schemas"
import type { BuilderResultDto, BuilderStatus, EnvironmentsBuilderDto } from "../types"

const base = "/environments/builder"
/** Dentro do prefixo do módulo: o tempo real (`environments`) também invalida o builder. */
export const builderKey = [ENVIRONMENTS_QUERY_KEY, "builder"] as const

/** Builder do buildx do servidor (estado, limites e uso), a cada 10 s como a lista dos ambientes. */
export const useEnvironmentsBuilder = () =>
    useQuery({ queryKey: builderKey, queryFn: async () => unwrapApi((await api.get<ApiResponse<EnvironmentsBuilderDto>>(base)).data), refetchInterval: 10_000 })

export function useSaveEnvironmentsBuilder() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: EnvironmentsBuilder) => unwrapApi((await api.put<ApiResponse<BuilderResultDto>>(base, input)).data),
        onSuccess: (result) => {
            queryClient.setQueryData(builderKey, result.builder)
            toast.success(result.message)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o builder")),
        onSettled: () => void queryClient.invalidateQueries({ queryKey: builderKey }),
    })
}

/** Estado que a linha mostra na hora (otimista) enquanto a ação roda. */
const PENDING_STATUS: Partial<Record<BuilderActionInput["action"], BuilderStatus>> = { start: "running", stop: "stopped" }

/** Ações no builder. Levantar/Derrubar são otimistas e voltam ao estado anterior com toast na falha. */
export function useEnvironmentsBuilderAction() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: BuilderActionInput) => unwrapApi((await api.post<ApiResponse<BuilderResultDto>>(`${base}/actions`, input)).data),
        onMutate: async (input) => {
            const status = PENDING_STATUS[input.action]
            if (!status) return { previous: undefined }
            await queryClient.cancelQueries({ queryKey: builderKey })
            const previous = queryClient.getQueryData<EnvironmentsBuilderDto>(builderKey)
            if (previous) queryClient.setQueryData<EnvironmentsBuilderDto>(builderKey, { ...previous, status, usage: status === "stopped" ? null : previous.usage })
            return { previous }
        },
        onSuccess: (result) => {
            queryClient.setQueryData(builderKey, result.builder)
            toast.success(result.message)
        },
        onError: (error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(builderKey, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível executar a ação no builder"))
        },
        onSettled: () => void queryClient.invalidateQueries({ queryKey: builderKey }),
    })
}
