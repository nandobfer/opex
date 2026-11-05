"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { RoutineEntryInput } from "../schemas"
import type { RoutineRunStatus } from "../status"
import type { RoutineAgentMetricsDto, RoutineEntryDto, RoutineRunDetailDto, RoutineRunDto } from "../types"
import { routineKeys } from "./keys"

/** Execuções, ações, entradas e métricas de um agente rotineiro no cliente (OPE-130). */

export function useRoutineRuns(agentId: string) {
    return useQuery({ queryKey: routineKeys.runs(agentId), queryFn: async () => unwrapApi((await api.get<ApiResponse<RoutineRunDto[]>>(`/routine-agents/${agentId}/runs`)).data) })
}

export function useRoutineRun(runId: string | null) {
    return useQuery({
        queryKey: routineKeys.run(runId ?? ""),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<RoutineRunDetailDto>>(`/routine-agents/runs/${runId}`)).data),
        enabled: Boolean(runId),
    })
}

export function useTriggerRoutineRun(agentId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (request: string) => unwrapApi((await api.post<ApiResponse<{ runId: string; status: RoutineRunStatus }>>(`/routine-agents/${agentId}/runs`, request.trim() ? { request } : {})).data),
        onSuccess: (result) => {
            toast.success(result.status === "queued" ? "Execução na fila" : "Execução iniciada")
            void queryClient.invalidateQueries({ queryKey: routineKeys.runs(agentId) })
            void queryClient.invalidateQueries({ queryKey: routineKeys.agent(agentId) })
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível executar o agente")),
    })
}

/** Atualiza a execução nas listas em cache (resposta otimista). */
function patchRun(queryClient: ReturnType<typeof useQueryClient>, agentId: string, runId: string, patch: Partial<RoutineRunDto>) {
    const previousList = queryClient.getQueryData<RoutineRunDto[]>(routineKeys.runs(agentId))
    const previousRun = queryClient.getQueryData<RoutineRunDetailDto>(routineKeys.run(runId))
    queryClient.setQueryData<RoutineRunDto[]>(routineKeys.runs(agentId), (list) => list?.map((run) => (run.id === runId ? { ...run, ...patch } : run)))
    queryClient.setQueryData<RoutineRunDetailDto>(routineKeys.run(runId), (run) => (run ? { ...run, ...patch } : run))
    return () => {
        queryClient.setQueryData(routineKeys.runs(agentId), previousList)
        queryClient.setQueryData(routineKeys.run(runId), previousRun)
    }
}

export function useCancelRoutineRun(agentId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (runId: string) => unwrapApi((await api.post<ApiResponse<{ status: string }>>(`/routine-agents/runs/${runId}/cancel`, {})).data),
        onMutate: (runId) => ({ rollback: patchRun(queryClient, agentId, runId, { status: "canceled" }) }),
        onSuccess: () => toast.success("Execução cancelada"),
        onError: (error, _runId, context) => {
            context?.rollback()
            toast.error(apiErrorMessage(error, "Não foi possível cancelar a execução"))
        },
        onSettled: (_data, _error, runId) => {
            void queryClient.invalidateQueries({ queryKey: routineKeys.runs(agentId) })
            void queryClient.invalidateQueries({ queryKey: routineKeys.run(runId) })
        },
    })
}

export function useResolveRoutineAction(agentId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ runId, decision }: { runId: string; decision: "confirm" | "reject" }) => unwrapApi((await api.post<ApiResponse<{ status: string }>>(`/routine-agents/runs/${runId}/${decision}`, {})).data),
        onMutate: ({ runId }) => ({ rollback: patchRun(queryClient, agentId, runId, { status: "queued" }) }),
        onSuccess: (_data, { decision }) => toast.success(decision === "confirm" ? "Ação confirmada: a execução foi retomada" : "Ação recusada: a execução foi retomada"),
        onError: (error, _input, context) => {
            context?.rollback()
            toast.error(apiErrorMessage(error, "Não foi possível responder a confirmação"))
        },
        onSettled: (_data, _error, { runId }) => {
            void queryClient.invalidateQueries({ queryKey: routineKeys.runs(agentId) })
            void queryClient.invalidateQueries({ queryKey: routineKeys.run(runId) })
        },
    })
}

export function useRoutineEntries(agentId: string) {
    return useQuery({ queryKey: routineKeys.entries(agentId), queryFn: async () => unwrapApi((await api.get<ApiResponse<RoutineEntryDto[]>>(`/routine-agents/${agentId}/entries`)).data) })
}

export function useAddRoutineEntry(agentId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: RoutineEntryInput) => unwrapApi((await api.post<ApiResponse<RoutineEntryDto>>(`/routine-agents/${agentId}/entries`, input)).data),
        onSuccess: (entry) => {
            toast.success("Entrada gravada: as próximas execuções vão considerá-la")
            queryClient.setQueryData<RoutineEntryDto[]>(routineKeys.entries(agentId), (list) => [entry, ...(list ?? [])])
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível gravar a entrada")),
    })
}

export function useRoutineMetrics(agentId: string, params: Record<string, string>, enabled = true) {
    return useQuery({
        queryKey: routineKeys.metrics(agentId, params),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<RoutineAgentMetricsDto>>(`/routine-agents/${agentId}/metrics`, { params })).data),
        enabled,
    })
}
