"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { acquireChannel, releaseChannel } from "@/lib/pusher/client"
import type { IntegrationLogLine } from "@/lib/integrations/log-format"

export type DebugStreamMode = "realtime" | "manual"

function lineKey(line: IntegrationLogLine): string {
    return `${line.ts}|${line.instance ?? ""}|${line.level}|${line.message}`
}

export interface DebugLogStreamSource {
    /** Busca as linhas gravadas: a carga inicial (`after` vazio) ou as novas desde a última. */
    fetch: (params: { after?: string; limit: number }) => Promise<IntegrationLogLine[]>
    /** Canal privado e evento do tempo real (`{ entries }`); `null` = só "Atualizar". */
    realtime: { channel: string; event: string } | null
    /** Filtro das linhas que chegam pelo tempo real (ex.: escopo). */
    accept?: (line: IntegrationLogLine) => boolean
    /** Muda quando a fonte muda (refaz a carga). */
    key: string
}

/**
 * Logs de debug de qualquer fonte (integrações, plugins): carga inicial do banco, "Atualizar" pelo
 * que chegou desde a última linha e tempo real pelo Pusher quando disponível. Linhas repetidas
 * (mesma data, instância, nível e texto) são descartadas.
 */
export function useDebugLogStream(source: DebugLogStreamSource, options: { enabled: boolean; onLines: (lines: IntegrationLogLine[], reset: boolean) => void }) {
    const { enabled } = options
    const onLinesRef = useRef(options.onLines)
    const sourceRef = useRef(source)
    useEffect(() => {
        onLinesRef.current = options.onLines
        sourceRef.current = source
    })
    const seen = useRef(new Set<string>())
    const lastTs = useRef<string | undefined>(undefined)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const channel = source.realtime?.channel ?? null
    const event = source.realtime?.event ?? null
    const mode: DebugStreamMode = channel ? "realtime" : "manual"

    const accept = useCallback((lines: IntegrationLogLine[], reset: boolean) => {
        if (reset) seen.current.clear()
        const fresh = lines.filter((line) => {
            const key = lineKey(line)
            if (seen.current.has(key)) return false
            seen.current.add(key)
            return true
        })
        for (const line of fresh) if (!lastTs.current || line.ts > lastTs.current) lastTs.current = line.ts
        if (fresh.length > 0 || reset) onLinesRef.current(fresh, reset)
    }, [])

    const refresh = useCallback(
        async (reset = false) => {
            setLoading(true)
            setError(null)
            try {
                const lines = await sourceRef.current.fetch(reset || !lastTs.current ? { limit: 500 } : { after: lastTs.current, limit: 1000 })
                if (reset) lastTs.current = undefined
                accept(lines, reset)
            } catch {
                setError("Não foi possível carregar os logs")
            } finally {
                setLoading(false)
            }
        },
        [accept],
    )

    useEffect(() => {
        if (!enabled) return
        // Fora do corpo do efeito: a carga inicial atualiza estado (loading/erro).
        const initial = setTimeout(() => void refresh(true), 0)
        if (!channel || !event) return () => clearTimeout(initial)
        const subscription = acquireChannel(channel)
        const handler = (payload: { entries?: IntegrationLogLine[] }) => {
            const filter = sourceRef.current.accept
            accept((payload.entries ?? []).filter((line) => !filter || filter(line)), false)
        }
        subscription.bind(event, handler)
        return () => {
            clearTimeout(initial)
            subscription.unbind(event, handler)
            releaseChannel(channel)
        }
    }, [accept, enabled, channel, event, refresh, source.key])

    return { mode, loading, error, refresh: () => refresh(false), reload: () => refresh(true) }
}
