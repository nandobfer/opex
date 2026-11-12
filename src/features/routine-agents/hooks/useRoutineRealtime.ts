"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { ROUTINE_AGENT_UPDATED_EVENT, ROUTINE_RUN_ATTENTION_EVENT, ROUTINE_RUN_UPDATED_EVENT, routineAgentHref } from "../constants"
import { ROUTINE_RUN_STATUS_LABELS } from "../status"
import type { RoutineAgentUpdatedPayload, RoutineRunAttentionPayload, RoutineRunUpdatedPayload } from "../types"
import { routineChatQueryPrefix } from "../chat"
import { routineKeys } from "./keys"

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
        channel.bind(ROUTINE_AGENT_UPDATED_EVENT, onAgent)
        channel.bind(ROUTINE_RUN_UPDATED_EVENT, onRun)
        return () => {
            channel.unbind(ROUTINE_AGENT_UPDATED_EVENT, onAgent)
            channel.unbind(ROUTINE_RUN_UPDATED_EVENT, onRun)
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
