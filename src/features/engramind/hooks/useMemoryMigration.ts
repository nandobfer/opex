"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { CuratorRunInput, MigrationBulkInput, MigrationItemPatch } from "../schemas/migration"
import type { BootstrapStepDto, MemoryMigrationDto } from "../types"
import { areaKey } from "./useEngramind"

const KEY = areaKey("migration")

/** Estado da migração das memórias dos agentes; relê sozinho enquanto uma etapa roda (e pelo tempo real). */
export function useMemoryMigration() {
    return useQuery({
        queryKey: KEY,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<MemoryMigrationDto>>("/engramind/migration")).data),
        refetchInterval: (query) => {
            const steps = query.state.data?.steps
            return steps && Object.values(steps).some((step) => step.status === "running") ? 3_000 : false
        },
    })
}

function useMigrationAction<I>(request: (input: I) => Promise<MemoryMigrationDto>, success: string | ((input: I) => string)) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: request,
        onSuccess: (data, input) => {
            queryClient.setQueryData(KEY, data)
            toast.success(typeof success === "function" ? success(input) : success)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível concluir a etapa da migração")),
    })
}

export function useMigrationBackup() {
    return useMigrationAction<void>(async () => unwrapApi((await api.post<ApiResponse<MemoryMigrationDto>>("/engramind/migration/backup")).data), "Backup gerado")
}

export function useMigrationCurator() {
    return useMigrationAction<CuratorRunInput>(async (input) => unwrapApi((await api.post<ApiResponse<MemoryMigrationDto>>("/engramind/migration/triage", input)).data), "Curador em execução: acompanhe o progresso aqui")
}

export function useMigrationCompact() {
    return useMigrationAction<string>(async (combination) => unwrapApi((await api.post<ApiResponse<MemoryMigrationDto>>("/engramind/migration/compact", { combination })).data), "Compactação em execução")
}

/** Revisão item a item com troca otimista da decisão (falha volta e avisa). */
export function useMigrationReview() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: MigrationItemPatch) => unwrapApi((await api.patch<ApiResponse<MemoryMigrationDto>>("/engramind/migration/items", input)).data),
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey: KEY })
            const previous = queryClient.getQueryData<MemoryMigrationDto>(KEY)
            if (previous) {
                const patches = new Map(input.items.map((item) => [item.id, item]))
                queryClient.setQueryData<MemoryMigrationDto>(KEY, {
                    ...previous,
                    items: previous.items.map((item) => {
                        const patch = patches.get(item.id)
                        return patch?.status ? { ...item, review: { ...item.review, status: patch.status } } : item
                    }),
                })
            }
            return { previous }
        },
        onError: (error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(KEY, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível salvar a revisão"))
        },
        onSuccess: (data) => queryClient.setQueryData(KEY, data),
    })
}

export function useMigrationBulk() {
    return useMigrationAction<MigrationBulkInput>(async (input) => unwrapApi((await api.post<ApiResponse<MemoryMigrationDto>>("/engramind/migration/review/bulk", input)).data), (input) => (input.status === "aprovada" ? "Lista aprovada" : "Lista rejeitada"))
}

export function useMigrationImport() {
    return useMigrationAction<void>(async () => unwrapApi((await api.post<ApiResponse<MemoryMigrationDto>>("/engramind/migration/import", { confirm: true })).data), "Importação em execução: acompanhe o progresso aqui")
}

/** "Conferir canais e agentes" (passo Memórias dos agentes). */
export function useMigrationProvision() {
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<BootstrapStepDto>>("/engramind/migration/provision")).data),
        onSuccess: (step) => (step.status === "failed" ? toast.error(step.message) : toast.success(step.message)),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível conferir canais e agentes")),
    })
}
