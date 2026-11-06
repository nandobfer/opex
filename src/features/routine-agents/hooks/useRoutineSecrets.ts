"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { RoutineSecretCreateInput, RoutineSecretUpdateInput } from "../schemas"
import type { RoutineSecretDto } from "../types"
import { routineKeys } from "./keys"

/** Segredos do agente rotineiro (OPE-130, D5): o valor só vai na criação/edição e nunca volta. */

export function useRoutineSecrets(agentId: string) {
    return useQuery({ queryKey: routineKeys.secrets(agentId), queryFn: async () => unwrapApi((await api.get<ApiResponse<RoutineSecretDto[]>>(`/routine-agents/${agentId}/secrets`)).data) })
}

export function useSaveRoutineSecret(agentId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, input }: { id: string | null; input: RoutineSecretCreateInput | RoutineSecretUpdateInput }) =>
            unwrapApi((id ? await api.patch<ApiResponse<RoutineSecretDto>>(`/routine-agents/${agentId}/secrets/${id}`, input) : await api.post<ApiResponse<RoutineSecretDto>>(`/routine-agents/${agentId}/secrets`, input)).data),
        onSuccess: (secret, { id }) => {
            toast.success(id ? "Segredo atualizado" : "Segredo criado")
            queryClient.setQueryData<RoutineSecretDto[]>(routineKeys.secrets(agentId), (list) => [...(list ?? []).filter((item) => item.id !== secret.id), secret].sort((a, b) => a.name.localeCompare(b.name)))
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o segredo")),
    })
}

export function useDeleteRoutineSecret(agentId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.delete<ApiResponse<{ id: string }>>(`/routine-agents/${agentId}/secrets/${id}`)).data),
        onSuccess: ({ id }) => {
            toast.success("Segredo excluído")
            queryClient.setQueryData<RoutineSecretDto[]>(routineKeys.secrets(agentId), (list) => (list ?? []).filter((item) => item.id !== id))
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível excluir o segredo")),
    })
}
