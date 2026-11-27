"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { ROUTINE_AGENT_UPDATED_EVENT, ROUTINE_RUN_ATTENTION_EVENT, ROUTINE_RUN_UPDATED_EVENT, routineAgentHref } from "../constants"
import { ROUTINE_RUN_STATUS_LABELS } from "../status"
import type { RoutineAgentUpdatedPayload, RoutineRunAttentionPayload, RoutineRunUpdatedPayload } from "../types"
import { routineChatQueryPrefix } from "../chat"
import { routineKeys } from "./keys"
import { AI_CONSUMPTION_UPDATED_EVENT } from "@nandobfer/integracoes/modules/integrations/ia/ai/consumption-events"
import { AI_PROVIDER_KEYS_UPDATED_EVENT } from "@nandobfer/integracoes/modules/integrations/ia/features/ai/api-keys"
import { AI_BILLING_UPDATED_EVENT } from "@nandobfer/integracoes/modules/integrations/ia/features/ai-billing/schemas"
import { ROUTINE_CONSUMPTION_ORIGIN } from "../constants"

/** Intervalo mínimo entre releituras de custo disparadas por consumo novo (passos chegam em rajada). */
export const ROUTINE_COST_REFRESH_MS = 5_000

/** Custos (OPE-203) mudaram: execuções, detalhe e métricas de todos os agentes são relidos. */
export function invalidateRoutineCosts(queryClient: QueryClient): void {
    for (const scope of ["runs", "run", "metrics", "metrics-all"]) void queryClient.invalidateQueries({ queryKey: [routineKeys.all[0], scope] })
}

/**
 * Tempo real dos agentes rotineiros (OPE-130): `routine-agent-updated` e `routine-run-updated` em
 * `private-app` invalidam o cache (agentes, execuções do agente e o detalhe da execução).
 */
export function useRoutineRealtime(enabled = true): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!enabled || !isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const onAgent = (payload: RoutineAgentUpdatedPayload) => {
            void queryClient.invalidateQueries({ queryKey: [routineKeys.all[0], "list"] })
            if (payload?.id) void queryClient.invalidateQueries({ queryKey: routineKeys.agent(payload.id) })
            if (payload?.id) void queryClient.invalidateQueries({ queryKey: routineKeys.secrets(payload.id) })
            // Conversa com o agente (OPE-160): modelo e disponibilidade mudam ao editar, pausar ou reprovisionar.
            if (payload?.id) void queryClient.invalidateQueries({ queryKey: [routineChatQueryPrefix(payload.id), "status"] })
            // Uma entrada global gravada num agente muda a lista de todos os outros (OPE-149).
            void queryClient.invalidateQueries({ queryKey: [routineKeys.all[0], "entries"] })
            if (payload?.id === "settings") void queryClient.invalidateQueries({ queryKey: routineKeys.settings })
        }
        const onRun = (payload: RoutineRunUpdatedPayload) => {
            if (!payload?.id) return
            void queryClient.invalidateQueries({ queryKey: routineKeys.run(payload.id) })
            if (payload.agentId) {
                void queryClient.invalidateQueries({ queryKey: routineKeys.runs(payload.agentId) })
                void queryClient.invalidateQueries({ queryKey: [routineKeys.all[0], "metrics", payload.agentId] })
                void queryClient.invalidateQueries({ queryKey: [routineKeys.all[0], "metrics-all"] })
            }
        }
        // Custos (OPE-203): plano da chave alterado, PTAX/uso das assinaturas gravados e consumo novo dos rotineiros.
        let costTimer: ReturnType<typeof setTimeout> | null = null
        const onCosts = () => invalidateRoutineCosts(queryClient)
        const onConsumption = (payload: { origin?: string } | undefined) => {
            if (payload?.origin !== ROUTINE_CONSUMPTION_ORIGIN || costTimer) return
            costTimer = setTimeout(() => {
                costTimer = null
                invalidateRoutineCosts(queryClient)
            }, ROUTINE_COST_REFRESH_MS)
        }
        channel.bind(ROUTINE_AGENT_UPDATED_EVENT, onAgent)
        channel.bind(ROUTINE_RUN_UPDATED_EVENT, onRun)
        channel.bind(AI_PROVIDER_KEYS_UPDATED_EVENT, onCosts)
        channel.bind(AI_BILLING_UPDATED_EVENT, onCosts)
        channel.bind(AI_CONSUMPTION_UPDATED_EVENT, onConsumption)
        return () => {
            if (costTimer) clearTimeout(costTimer)
            channel.unbind(ROUTINE_AGENT_UPDATED_EVENT, onAgent)
            channel.unbind(ROUTINE_RUN_UPDATED_EVENT, onRun)
            channel.unbind(AI_PROVIDER_KEYS_UPDATED_EVENT, onCosts)
            channel.unbind(AI_BILLING_UPDATED_EVENT, onCosts)
            channel.unbind(AI_CONSUMPTION_UPDATED_EVENT, onConsumption)
            releaseChannel(name)
        }
    }, [enabled, queryClient])
}

/** Texto do toast de atenção (módulo exportado para os testes). */
export function attentionToast(payload: RoutineRunAttentionPayload): { kind: "warning" | "success" | "error" | "info"; message: string } {
    const name = payload.agentName ? `"${payload.agentName}"` : "rotineiro"
    if (payload.kind === "confirmation") return { kind: "warning", message: `O agente ${name} aguarda sua confirmação` }
    const label = ROUTINE_RUN_STATUS_LABELS[payload.status].toLowerCase()
    if (payload.status === "completed") return { kind: "success", message: `Execução do agente ${name} concluída` }
    if (payload.status === "canceled") return { kind: "info", message: `Execução do agente ${name} cancelada` }
    return { kind: "error", message: `Execução do agente ${name}: ${label}` }
}

/**
 * Toast em qualquer tela (montado no `AppShell`): ação pendente de confirmação e fim de execução, com
 * "Abrir execução" (`routine-run-attention`).
 */
export function useRoutineAttentionToasts(enabled = true): void {
    const router = useRouter()
    useEffect(() => {
        if (!enabled || !isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = (payload: RoutineRunAttentionPayload) => {
            if (!payload?.id || !payload.agentId) return
            const { kind, message } = attentionToast(payload)
            const action = { label: "Abrir execução", onClick: () => router.push(routineAgentHref(payload.agentId, payload.id)) }
            toast[kind](message, { action, id: `routine-run-${payload.id}-${payload.kind}` })
        }
        channel.bind(ROUTINE_RUN_ATTENTION_EVENT, handler)
        return () => {
            channel.unbind(ROUTINE_RUN_ATTENTION_EVENT, handler)
            releaseChannel(name)
        }
    }, [enabled, router])
}
