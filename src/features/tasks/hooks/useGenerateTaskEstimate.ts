"use client"

import { useCallback, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { readNdjson } from "@/features/orcamentos/review"
import type { TaskEstimate } from "../types"
import { TASKS_QUERY_KEY, taskDetailKey } from "./useTasks"

/**
 * Gera a estimativa de horas da tarefa por IA (aba Estimativa): roda o núcleo de "Estimar prazos"
 * sobre os dados da própria tarefa e grava o snapshot. Acompanha o progresso em streaming
 * (`POST /api/tasks/[id]/estimate/generate`) e revalida a tarefa ao concluir.
 */
export interface GenerateTaskEstimate {
    running: boolean
    /** Progresso corrente (ex.: ferramenta/tarefa do agente). */
    notice: string | null
    error: string | null
    estimate: TaskEstimate | null
    generate: () => Promise<void>
}

export function useGenerateTaskEstimate(taskId: string, code: string): GenerateTaskEstimate {
    const queryClient = useQueryClient()
    const [state, setState] = useState<Omit<GenerateTaskEstimate, "generate">>({ running: false, notice: null, error: null, estimate: null })

    const generate = useCallback(async () => {
        setState({ running: true, notice: null, error: null, estimate: null })
        const outcome = { error: null as string | null }
        try {
            await readNdjson<TaskEstimate>(`/api/tasks/${taskId}/estimate/generate`, {}, (event) => {
                if (event.type === "notice") setState((prev) => ({ ...prev, notice: event.message ?? null }))
                else if (event.type === "tool") setState((prev) => ({ ...prev, notice: event.state === "running" ? `Consultando (${event.name ?? "ferramenta"})…` : prev.notice }))
                else if (event.type === "done") setState((prev) => ({ ...prev, running: false, estimate: event.estimate ?? null, notice: null }))
                else if (event.type === "error") {
                    outcome.error = event.message ?? "Falha na estimativa"
                    setState((prev) => ({ ...prev, running: false, error: outcome.error }))
                }
            })
        } catch (err) {
            outcome.error = err instanceof Error ? err.message : "Falha na conexão com o servidor"
        }
        if (outcome.error) {
            setState((prev) => (prev.running ? { ...prev, running: false, error: outcome.error } : prev))
            toast.error(outcome.error)
            return
        }
        toast.success(`Estimativa de ${code} gerada`)
        void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "list"] })
        void queryClient.invalidateQueries({ queryKey: taskDetailKey(taskId) })
    }, [taskId, code, queryClient])

    return { ...state, generate }
}
