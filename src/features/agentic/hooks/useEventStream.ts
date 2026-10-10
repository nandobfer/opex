"use client"

import { useEffect, useState } from "react"
import { applyTimelineLine, INITIAL_TIMELINE, splitNdjson, type TimelineState } from "../timeline"

const RETRY_MS = 3_000
/** Sem nada (nem `ping`) por este tempo, a conexão é refeita. */
const STALE_MS = 45_000

/**
 * Saída ao vivo de uma execução longa (`GET <url>`, NDJSON). A cada conexão o servidor manda
 * `reset` + tudo o que foi gravado + o que chegar depois. Cai a conexão → reconecta sozinho.
 * Genérico: a mesa e o refinamento de tarefas usam o mesmo formato de evento.
 */
export function useEventStream(id: string | null, url: string | null): { timeline: TimelineState; connected: boolean } {
    const [state, setState] = useState<{ id: string | null; timeline: TimelineState; connected: boolean }>({ id: null, timeline: INITIAL_TIMELINE, connected: false })

    useEffect(() => {
        if (!id || !url) return
        let disposed = false
        let controller: AbortController | null = null
        let retry: ReturnType<typeof setTimeout> | null = null
        let watchdog: ReturnType<typeof setTimeout> | null = null

        const armWatchdog = () => {
            if (watchdog) clearTimeout(watchdog)
            watchdog = setTimeout(() => controller?.abort(), STALE_MS)
        }

        const connect = async () => {
            controller = new AbortController()
            armWatchdog()
            try {
                const res = await fetch(url, { signal: controller.signal, cache: "no-store" })
                if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
                setState((current) => ({ ...current, id, connected: true }))
                const reader = res.body.getReader()
                const decoder = new TextDecoder()
                let buffer = ""
                for (;;) {
                    const { value, done } = await reader.read()
                    if (done) break
                    armWatchdog()
                    buffer += decoder.decode(value, { stream: true })
                    const parsed = splitNdjson(buffer)
                    buffer = parsed.rest
                    if (parsed.lines.length) setState((current) => ({ ...current, id, timeline: parsed.lines.reduce(applyTimelineLine, current.id === id ? current.timeline : INITIAL_TIMELINE) }))
                }
            } catch {
                // queda ou aborto: tenta de novo abaixo
            }
            if (disposed) return
            setState((current) => ({ ...current, connected: false }))
            retry = setTimeout(() => void connect(), RETRY_MS)
        }

        void connect()
        return () => {
            disposed = true
            controller?.abort()
            if (retry) clearTimeout(retry)
            if (watchdog) clearTimeout(watchdog)
        }
    }, [id, url])

    if (state.id !== id) return { timeline: INITIAL_TIMELINE, connected: false }
    return { timeline: state.timeline, connected: state.connected }
}
