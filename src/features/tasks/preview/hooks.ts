"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { ClienteDraftInput } from "@/features/orcamentos/schemas"
import type { OrcamentoDraftDto } from "@/features/orcamentos/types"
import type { TaskPriority } from "../constants"
import type { TaskDto } from "../types"
import { TASKS_QUERY_KEY } from "../hooks/useTasks"

/**
 * Consultas e mutações da **prévia do dono** (`/tarefas/previa`). Diferente do portal, os endpoints
 * são internos (`/tasks/drafts/**`, autenticados pela sessão) e não carregam token nenhum.
 */

export const OWNER_PREVIEW_QUERY_KEY = "owner-preview"
const draftKey = (id: string) => [OWNER_PREVIEW_QUERY_KEY, "draft", id] as const

export function useOwnerDraft(id: string) {
    return useQuery({
        queryKey: draftKey(id),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OrcamentoDraftDto>>(`/tasks/drafts/${id}`)).data),
        enabled: Boolean(id),
    })
}

export function useCreateOwnerDraft() {
    return useMutation({
        mutationFn: async (input: ClienteDraftInput) => unwrapApi((await api.post<ApiResponse<OrcamentoDraftDto>>("/tasks/drafts", input)).data),
    })
}

export function useSetOwnerCorrection(id: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (correction: string) => unwrapApi((await api.post<ApiResponse<OrcamentoDraftDto>>(`/tasks/drafts/${id}/correction`, { correction })).data),
        onSuccess: (draft) => queryClient.setQueryData(draftKey(id), draft),
    })
}

export function useApproveOwnerDraft(id: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (priority?: TaskPriority) => unwrapApi((await api.post<ApiResponse<TaskDto>>(`/tasks/drafts/${id}/approve`, priority ? { priority } : {})).data),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY] })
            void queryClient.invalidateQueries({ queryKey: draftKey(id) })
        },
    })
}
