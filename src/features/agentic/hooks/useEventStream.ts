"use client"

import { useEffect, useState } from "react"
import { splitNdjson, type TimelineState } from "../timeline"
import { readTimelineCache, writeTimelineCache } from "../timeline-cache"
import { applyStreamLines, streamViewFrom, type StreamView } from "../stream-view"
import type { WorkbenchStreamLine } from "../types"

const RETRY_MS = 3_000
/** Sem nada (nem `ping`) por este tempo, a conexão é refeita. */
const STALE_MS = 45_000

const nextFrame = (run: () => void): (() => void) => {
    if (typeof requestAnimationFrame === "function") {
        const handle = requestAnimationFrame(run)
        return () => cancelAnimationFrame(handle)
    }
    const handle = setTimeout(run, 16)
    return () => clearTimeout(handle)
}

interface StreamState {
    url: string | null
    view: StreamView
    connected: boolean
}

/**
 * Saída ao vivo de uma execução longa (`GET <url>`, NDJSON). A cada conexão o servidor manda
 * `reset` + tudo o que foi gravado + `ready` + o que chegar depois. Cai a conexão → reconecta sozinho.
 * Genérico: a mesa, os forks, o refinamento e a revisão de PR usam o mesmo formato de evento.
 *
 * OPE-188: a saída já vista fica guardada em memória (`timeline-cache`) e aparece na hora ao voltar;
 * a releitura acontece por trás e a tela troca no `ready` (`stream-view`). As linhas são aplicadas uma
 * vez por quadro, para não redesenhar a cada pedaço da rede.
 */
export function useEventStream(id: string | null, url: string | null): { timeline: TimelineState; connected: boolean } {
    const key = id && url ? url : null
    const [state, setState] = useState<StreamState>(() => ({ url: key, view: streamViewFrom(key ? readTimelineCache(key) : null), connected: false }))

    useEffect(() => {
        if (!key) return
        let disposed = false
        let controller: AbortController | null = null
        let retry: ReturnType<typeof setTimeout> | null = null
        let watchdog: ReturnType<typeof setTimeout> | null = null
        let pending: WorkbenchStreamLine[] = []
        let cancelFrame: (() => void) | null = null

        const flush = () => {
            cancelFrame = null
            const lines = pending
            pending = []
            if (disposed || !lines.length) return
            setState((current) => {
                const base = current.url === key ? current.view : streamViewFrom(readTimelineCache(key))
                const view = applyStreamLines(base, lines)
                if (view.shown !== base.shown) writeTimelineCache(key, view.shown)
                return { ...current, url: key, view }
            })
        }

        const armWatchdog = () => {
            if (watchdog) clearTimeout(watchdog)
            watchdog = setTimeout(() => controller?.abort(), STALE_MS)
        }

        const connect = async () => {
            controller = new AbortController()
            armWatchdog()
            try {
                const res = await fetch(key, { signal: controller.signal, cache: "no-store" })
                if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
                setState((current) => (current.url === key ? { ...current, connected: true } : { url: key, view: streamViewFrom(readTimelineCache(key)), connected: true }))
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
                    if (!parsed.lines.length) continue
                    pending.push(...parsed.lines)
                    cancelFrame ??= nextFrame(flush)
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
            cancelFrame?.()
            if (retry) clearTimeout(retry)
            if (watchdog) clearTimeout(watchdog)
        }
    }, [key])

    if (!key) return { timeline: streamViewFrom(null).shown, connected: false }
    if (state.url !== key) return { timeline: streamViewFrom(readTimelineCache(key)).shown, connected: false }
    return { timeline: state.view.shown, connected: state.connected }
}
