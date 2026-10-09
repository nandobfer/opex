"use client"

import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getPusherClient, isPusherClientAvailable } from "./client"

export type RealtimeState = "connected" | "connecting" | "unavailable" | "disabled"

/**
 * Estado da conexão de tempo real. Ao VOLTAR para `connected` depois de uma queda, invalida as
 * consultas ativas (refaz o que mudou; mensagens são mescladas por id, sem duplicar).
 * Sem Pusher configurado, `disabled` (as telas usam polling).
 */
export function useRealtimeConnection(): RealtimeState {
    const queryClient = useQueryClient()
    const [state, setState] = useState<RealtimeState>(() => (isPusherClientAvailable() ? "connecting" : "disabled"))
    const dropped = useRef(false)

    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const connection = getPusherClient().connection
        const onChange = ({ current }: { current: string }) => {
            if (current === "connected") {
                if (dropped.current) void queryClient.invalidateQueries({ type: "active" })
                dropped.current = false
                setState("connected")
            } else if (current === "unavailable" || current === "failed" || current === "disconnected") {
                dropped.current = true
                setState("unavailable")
            } else {
                setState("connecting")
            }
        }
        connection.bind("state_change", onChange)
        queueMicrotask(() => onChange({ current: connection.state }))
        return () => {
            connection.unbind("state_change", onChange)
        }
    }, [queryClient])

    return state
}
