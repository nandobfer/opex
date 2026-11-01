"use client"

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { withBasePath } from "@/lib/base-path"
import type { ArchitectGraph } from "../graph"
import { applyOps } from "../stream-parser"
import type { ArchitectLiveProgress, ArchitectStreamLine } from "../types"
import { workbenchDiagramsKey } from "./useArchitect"

const RETRY_MS = 2_000
/** Sem nada (nem `ping`) por este tempo, a conexão é refeita. */
const STALE_MS = 45_000

export interface LiveDiagramState {
    graph: ArchitectGraph | null
    progress: ArchitectLiveProgress | null
    /** Última operação aplicada (o retrato traz a dele). */
    seq: number
    connected: boolean
    ended: boolean
}

export const LIVE_INITIAL: LiveDiagramState = { graph: null, progress: null, seq: 0, connected: false, ended: false }

/** Divide o buffer NDJSON em linhas completas (a última, sem quebra, fica no resto). */
export function splitLiveLines(buffer: string): { lines: ArchitectStreamLine[]; rest: string } {
    const parts = buffer.split("\n")
    const rest = parts.pop() ?? ""
    const lines: ArchitectStreamLine[] = []
    for (const part of parts) {
        if (!part.trim()) continue
        try {
            lines.push(JSON.parse(part) as ArchitectStreamLine)
        } catch {
            // linha inválida: ignora
        }
    }
    return { lines, rest }
}

/** Aplica uma linha do stream: o retrato substitui tudo; operações repetidas ou antigas (seq) são ignoradas. */
export function reduceLiveLine(state: LiveDiagramState, line: ArchitectStreamLine): LiveDiagramState {
    if (line.type === "snapshot") return { ...state, graph: line.graph, progress: line.progress, seq: line.seq, ended: false }
    if (line.type === "ops") {
        if (!state.graph || line.seq <= state.seq) return state
        return { ...state, graph: applyOps(state.graph, line.ops), seq: line.seq, progress: state.progress }
    }
    if (line.type === "progress") return { ...state, progress: line.progress }
    // `end` com a versão ainda "gerando": o servidor não tinha a geração viva no momento (ela está
    // começando); não é o fim — o cliente reconecta e recebe o retrato vivo.
    if (line.type === "end") return line.state === "running" ? state : { ...state, ended: true }
    return state
}

/**
 * Diagrama ao vivo de uma versão em geração (`GET /api/architect/diagrams/[id]/stream`, NDJSON). Cada
 * conexão começa pelo retrato; caiu, reconecta sozinho. No `end`, relê as versões da mesa (o grafo
 * final gravado) e não reconecta mais.
 */
export function useLiveDiagram(workbenchId: string, diagramId: string | null): LiveDiagramState {
    const queryClient = useQueryClient()
    const [state, setState] = useState<{ id: string | null; value: LiveDiagramState }>({ id: null, value: LIVE_INITIAL })

    useEffect(() => {
        if (!diagramId) return
        let disposed = false
        let ended = false
        let controller: AbortController | null = null
        let retry: ReturnType<typeof setTimeout> | null = null
        let watchdog: ReturnType<typeof setTimeout> | null = null
        const url = withBasePath(`/api/architect/diagrams/${diagramId}/stream`)
        const update = (fn: (value: LiveDiagramState) => LiveDiagramState) => setState((current) => ({ id: diagramId, value: fn(current.id === diagramId ? current.value : LIVE_INITIAL) }))
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
                update((value) => ({ ...value, connected: true }))
                const reader = res.body.getReader()
                const decoder = new TextDecoder()
                let buffer = ""
                for (;;) {
                    const { value, done } = await reader.read()
                    if (done) break
                    armWatchdog()
                    buffer += decoder.decode(value, { stream: true })
                    const parsed = splitLiveLines(buffer)
                    buffer = parsed.rest
                    if (!parsed.lines.length) continue
                    update((current) => parsed.lines.reduce(reduceLiveLine, current))
                    if (parsed.lines.some((line) => line.type === "end" && line.state !== "running")) ended = true
                }
            } catch {
                // queda ou aborto: tenta de novo abaixo
            }
            if (watchdog) clearTimeout(watchdog)
            if (disposed) return
            update((value) => ({ ...value, connected: false }))
            if (ended) {
                void queryClient.invalidateQueries({ queryKey: workbenchDiagramsKey(workbenchId) })
                return
            }
            retry = setTimeout(() => void connect(), RETRY_MS)
        }

        void connect()
        return () => {
            disposed = true
            controller?.abort()
            if (retry) clearTimeout(retry)
            if (watchdog) clearTimeout(watchdog)
        }
    }, [diagramId, workbenchId, queryClient])

    return state.id === diagramId ? state.value : LIVE_INITIAL
}
