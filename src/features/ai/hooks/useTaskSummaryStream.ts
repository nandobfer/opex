"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { withBasePath } from "@/lib/base-path"
import { parseNdjsonChunk } from "@/features/integrations/hooks/useIntegrationTestStream"
import type { TaskSummaryEvent } from "../types"
import { applyAiStreamEvent, finishAiStream, INITIAL_AI_STREAM_STATE, type AiStreamState } from "../ai-stream-state"

/**
 * Executa `POST /api/tasks/[id]/summary` e aplica cada evento NDJSON assim que chega (mesmo
 * redutor de `ai-stream-state`). `stop` aborta a requisição (o servidor cancela a
 * geração); desmontar também cancela. O resumo é gravado no servidor ao final.
 */
export function useTaskSummaryStream(taskId: string) {
    const [state, setState] = useState<AiStreamState>(INITIAL_AI_STREAM_STATE)
    const controllerRef = useRef<AbortController | null>(null)

    const start = useCallback(async () => {
        controllerRef.current?.abort()
        const controller = new AbortController()
        controllerRef.current = controller
        setState({ ...INITIAL_AI_STREAM_STATE, status: "running" })
        try {
            const res = await fetch(withBasePath(`/api/tasks/${encodeURIComponent(taskId)}/summary`), { method: "POST", signal: controller.signal })
            if (!res.ok || !res.body) {
                const body = (await res.json().catch(() => ({}))) as { error?: string }
                setState((current) => ({ ...current, status: "error", error: body.error ?? `Não foi possível iniciar (HTTP ${res.status})` }))
                return
            }
            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ""
            for (;;) {
                const { value, done } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                const parsed = parseNdjsonChunk<TaskSummaryEvent>(buffer)
                buffer = parsed.rest
                if (parsed.events.length) setState((current) => parsed.events.reduce(applyAiStreamEvent, current))
            }
            setState(finishAiStream)
        } catch (error) {
            if ((error as Error).name === "AbortError") {
                setState((current) => (current.status === "running" ? { ...current, status: "cancelled", reasoning: false } : current))
                return
            }
            setState((current) => finishAiStream({ ...current, status: "running" }))
        } finally {
            if (controllerRef.current === controller) controllerRef.current = null
        }
    }, [taskId])

    const stop = useCallback(() => controllerRef.current?.abort(), [])
    const reset = useCallback(() => {
        controllerRef.current?.abort()
        setState(INITIAL_AI_STREAM_STATE)
    }, [])

    useEffect(() => () => controllerRef.current?.abort(), [])

    return { state, start, stop, reset }
}
