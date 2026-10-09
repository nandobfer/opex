"use client"

import { useCallback, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { BulkTaskAction, BulkTaskResult, BulkTasksInput } from "../schemas"
import type { TaskDto } from "../types"
import { patchTasksInCache, TASKS_QUERY_KEY } from "./useTasks"

/** Tarefas enviadas por requisição (o servidor processa 4 em paralelo): dá o progresso "3 de 10". */
export const BULK_CHUNK_SIZE = 4
export const UNDO_TOAST_MS = 8000

export interface BulkItem {
    task: TaskDto
    action: BulkTaskAction
    /** Alteração otimista na tela. */
    patch: Partial<TaskDto>
    /** Como desfazer; `null` = não dá (ex.: foi para Em Produção). */
    undo: { action: BulkTaskAction; patch: Partial<TaskDto> } | null
}

export interface BulkProgress {
    label: string
    done: number
    total: number
}

interface RunOptions {
    /** Oferece "Desfazer" no toast de sucesso. */
    undoable?: boolean
    /** Avisos extras do toast (ex.: tarefas puladas). */
    note?: string
    onDone?: (results: BulkTaskResult[]) => void
}

/** Valores atuais dos campos que o patch muda (para reverter uma tarefa que falhou). */
function revertOf(task: TaskDto, patch: Partial<TaskDto>): Partial<TaskDto> {
    const revert: Record<string, unknown> = {}
    for (const key of Object.keys(patch) as (keyof TaskDto)[]) revert[key] = task[key]
    return revert as Partial<TaskDto>
}

/**
 * Executa ações em lote (`POST /api/tasks/bulk`) em pedaços de 4: muda tudo na hora, mostra o
 * progresso, reverte só as que falharam e resume no toast (com "Desfazer" por 8 s).
 */
export function useBulkTasks() {
    const queryClient = useQueryClient()
    const [progress, setProgress] = useState<BulkProgress | null>(null)

    const run = useCallback(
        async function runBulk(label: string, items: BulkItem[], options: RunOptions = {}): Promise<BulkTaskResult[]> {
            if (items.length === 0) {
                if (options.note) toast.info(options.note)
                return []
            }
            setProgress({ label, done: 0, total: items.length })
            await queryClient.cancelQueries({ queryKey: [TASKS_QUERY_KEY] })
            patchTasksInCache(queryClient, new Map(items.map((item) => [item.task.id, item.patch])))

            const results: BulkTaskResult[] = []
            for (let start = 0; start < items.length; start += BULK_CHUNK_SIZE) {
                const chunk = items.slice(start, start + BULK_CHUNK_SIZE)
                const body: BulkTasksInput = { items: chunk.map((item) => ({ id: item.task.id, code: item.task.code, fromStatus: item.task.status, action: item.action })) }
                let chunkResults: BulkTaskResult[]
                try {
                    chunkResults = unwrapApi((await api.post<ApiResponse<{ results: BulkTaskResult[] }>>("/tasks/bulk", body)).data).results
                } catch (error) {
                    const message = apiErrorMessage(error, "Falha ao falar com o servidor")
                    chunkResults = chunk.map((item) => ({ id: item.task.id, ok: false, error: message }))
                }
                const failed = new Map<string, Partial<TaskDto>>()
                for (const result of chunkResults) {
                    if (result.ok) continue
                    const item = chunk.find((candidate) => candidate.task.id === result.id)
                    if (item) failed.set(item.task.id, revertOf(item.task, item.patch))
                }
                patchTasksInCache(queryClient, failed)
                results.push(...chunkResults)
                setProgress({ label, done: Math.min(items.length, start + chunk.length), total: items.length })
            }

            setProgress(null)
            void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY] })

            const ok = results.filter((result) => result.ok)
            const failedResults = results.filter((result) => !result.ok)
            const byId = new Map(items.map((item) => [item.task.id, item]))
            const undoItems: BulkItem[] = options.undoable
                ? ok.flatMap((result) => {
                      const item = byId.get(result.id)
                      if (!item?.undo) return []
                      return [{ task: { ...item.task, ...item.patch }, action: item.undo.action, patch: item.undo.patch, undo: null }]
                  })
                : []
            const irreversible = options.undoable ? ok.length - undoItems.length : 0
            const notes = [
                options.note,
                irreversible > 0 ? `${irreversible} não pode(m) ser desfeita(s) (Em Produção é final).` : null,
                ...failedResults.slice(0, 3).map((result) => `${byId.get(result.id)?.task.code ?? result.id}: ${result.error ?? "falhou"}`),
                failedResults.length > 3 ? `e mais ${failedResults.length - 3} com falha` : null,
            ].filter(Boolean)
            const description = notes.length ? notes.join("\n") : undefined
            const action = undoItems.length ? { label: "Desfazer", onClick: () => void runBulk(`Desfazendo: ${label}`, undoItems, {}) } : undefined

            if (failedResults.length === 0) toast.success(`${label}: ${ok.length} tarefa(s)`, { description, action, duration: action ? UNDO_TOAST_MS : undefined })
            else if (ok.length === 0) toast.error(`${label}: nenhuma tarefa atualizada`, { description })
            else toast.warning(`${label}: ${ok.length} atualizada(s), ${failedResults.length} com falha`, { description, action, duration: action ? UNDO_TOAST_MS : undefined })

            options.onDone?.(results)
            return results
        },
        [queryClient],
    )

    return { run, progress, running: progress !== null }
}
