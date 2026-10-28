"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { applyBuildLogLine, INITIAL_BUILD_LOG_VIEW, splitBuildLogChunk, type BuildLogViewState, type WorkbenchBuildDto } from "../build-log"
import { agenticKey } from "./useAgentic"

/**
 * Builds da prévia de uma mesa (aba "Build (N)"). A lista é atualizada em tempo real pelo
 * `useAgenticRealtime` (o evento `agentic-updated` do início e do fim de cada build invalida as
 * consultas do desenvolvimento agêntico).
 */

export const buildsKey = (workbenchId: string) => agenticKey("builds", workbenchId)
const base = (workbenchId: string) => `/agentic/workbenches/${workbenchId}/builds`

export const useWorkbenchBuilds = (workbenchId: string) =>
    useQuery({ queryKey: buildsKey(workbenchId), queryFn: async () => unwrapApi((await api.get<ApiResponse<WorkbenchBuildDto[]>>(base(workbenchId))).data) })

/** Onde o log é desenhado (o terminal). */
export interface BuildLogSink {
    reset(text: string): void
    write(text: string): void
}

const RETRY_MS = 3_000
/** Sem nada (nem `ping`) por este tempo, a conexão é refeita. */
const STALE_MS = 45_000

/**
 * Log de um build ao vivo (`GET /api/agentic/workbenches/[id]/builds/[buildId]/log`, NDJSON). Cada
 * conexão começa com um `snapshot`; os `append` seguintes são conferidos pela posição (`offset`) e
 * um trecho faltando faz reconectar. Build encerrado: o servidor fecha o stream e o hook para.
 */
export function useBuildLogStream(workbenchId: string, buildId: string | null, sink: BuildLogSink): { view: BuildLogViewState; connected: boolean; error: boolean; retry: () => void } {
    const [state, setState] = useState<{ key: string | null; view: BuildLogViewState; connected: boolean; error: boolean }>({ key: null, view: INITIAL_BUILD_LOG_VIEW, connected: false, error: false })
    const [attempt, setAttempt] = useState(0)
    const sinkRef = useRef(sink)
    useEffect(() => {
        sinkRef.current = sink
    })
    const key = buildId ? `${workbenchId}:${buildId}:${attempt}` : null

    useEffect(() => {
        if (!buildId || !key) return
        const url = `/api${base(workbenchId)}/${buildId}/log`
        let disposed = false
        let controller: AbortController | null = null
        let retry: ReturnType<typeof setTimeout> | null = null
        let watchdog: ReturnType<typeof setTimeout> | null = null
        let view = INITIAL_BUILD_LOG_VIEW
        const armWatchdog = () => {
            if (watchdog) clearTimeout(watchdog)
            watchdog = setTimeout(() => controller?.abort(), STALE_MS)
        }

        const connect = async () => {
            controller = new AbortController()
            view = INITIAL_BUILD_LOG_VIEW
            armWatchdog()
            let resync = false
            try {
                const res = await fetch(url, { signal: controller.signal, cache: "no-store" })
                if (!res.ok || !res.body) {
                    // Build inexistente (excluído) ou erro do servidor: mostra o erro com Tentar novamente.
                    if (!disposed) setState({ key, view, connected: false, error: true })
                    return
                }
                setState((current) => ({ ...current, key, connected: true, error: false }))
                const reader = res.body.getReader()
                const decoder = new TextDecoder()
                let buffer = ""
                for (;;) {
                    const { value, done } = await reader.read()
                    if (done) break
                    armWatchdog()
                    buffer += decoder.decode(value, { stream: true })
                    const parsed = splitBuildLogChunk(buffer)
                    buffer = parsed.rest
                    for (const line of parsed.lines) {
                        const step = applyBuildLogLine(view, line)
                        view = step.state
                        if (step.reset !== undefined) sinkRef.current.reset(step.reset)
                        if (step.write) sinkRef.current.write(step.write)
                        if (step.resync) {
                            resync = true
                            break
                        }
                    }
                    if (resync) break
                    if (parsed.lines.length) setState((current) => ({ ...current, key, view }))
                }
            } catch {
                // queda ou aborto: decide abaixo
            }
            if (watchdog) clearTimeout(watchdog)
            if (disposed) return
            setState((current) => ({ ...current, key, view, connected: false }))
            // Build encerrado: o servidor fechou o stream depois do status final. Em andamento: reconecta.
            if (!resync && view.loaded && view.status !== "running") return
            retry = setTimeout(() => void connect(), resync ? 0 : RETRY_MS)
        }

        void connect()
        return () => {
            disposed = true
            controller?.abort()
            if (retry) clearTimeout(retry)
            if (watchdog) clearTimeout(watchdog)
        }
    }, [workbenchId, buildId, key])

    const current = state.key === key ? state : { view: INITIAL_BUILD_LOG_VIEW, connected: false, error: false }
    return { view: current.view, connected: current.connected, error: current.error, retry: () => setAttempt((value) => value + 1) }
}
