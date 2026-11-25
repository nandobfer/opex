"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage } from "@/lib/api"
import type { MemoryIdentity } from "../agents"
import { ENGRAMIND_QUERY_KEY } from "@/features/engramind/constants"

export interface AgentMemoryStatusDto { exists: boolean; disabled: boolean }
interface ProvisionStepDto { id: string; status: "ok" | "skipped" | "failed"; message: string }

export const agentMemoryStatusKey = (consumer: MemoryIdentity) => ["agent-memory-status", consumer] as const

/** Se o agente de memórias existe no Engramind (estado vazio com "Cadastrar agente" no universo). */
export function useAgentMemoryStatus(consumer: MemoryIdentity | null | undefined) {
    return useQuery({
        queryKey: agentMemoryStatusKey(consumer ?? "opex"),
        enabled: Boolean(consumer),
        retry: false,
        queryFn: async () => (await api.get<{ data: AgentMemoryStatusDto }>(`/ai/memories/agents/${encodeURIComponent(consumer!)}`)).data.data,
    })
}

/**
 * "Cadastrar agente no Engramind": roda o passo "Memórias dos agentes" (canais, agentes, assinaturas e tokens) e, no
 * sucesso, recarrega a existência e as consultas da lib do Engramind (o universo aparece). Passo `failed` vira erro.
 */
export function useProvisionAgent(consumer: MemoryIdentity) {
    const cache = useQueryClient()
    return useMutation({
        mutationFn: async () => {
            const step = (await api.post<{ data: ProvisionStepDto }>(`/ai/memories/agents/${encodeURIComponent(consumer)}/provision`)).data.data
            if (step.status === "failed") throw new Error(step.message)
            return step
        },
        onSuccess: () => {
            toast.success("Agente cadastrado no Engramind")
            void cache.invalidateQueries({ queryKey: agentMemoryStatusKey(consumer) })
            void cache.invalidateQueries({ queryKey: [ENGRAMIND_QUERY_KEY] })
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível cadastrar o agente no Engramind")),
    })
}
