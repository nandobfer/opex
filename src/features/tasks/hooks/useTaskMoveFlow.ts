"use client"

import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import type { CreatableTaskStatus } from "@/features/github/schemas"
import { columnKeyOf, isCustomColumnKey, type BoardColumnView } from "../board"
import { FINAL_TASK_STATUS, requiredUrlFor, TASK_STATUS_LABELS, type RequiredUrl, type TaskStatus } from "../constants"
import { DRAFT_BLOCKED_MESSAGE, DRAFT_SENDABLE_STATUSES } from "../drafts"
import type { MoveUrlRequest } from "../components/MoveUrlDialog"
import type { SendDraftRequest } from "../components/draft/SendDraftDialog"
import type { TaskDto } from "../types"
import { moveFailureOf, useMoveTask } from "./useTasks"

export interface PendingUrlMove {
    task: TaskDto
    targetStatus: TaskStatus
    order?: number
    requires: RequiredUrl
}

/**
 * Fluxo de mudança de coluna usado pelo kanban, pela tabela e pela página da tarefa.
 * - Coluna customizada: só nO Opex (vale até para tarefa em Produção e para rascunhos).
 * - Coluna do Go! Sipal: bloqueia sair de "Em Produção", pede a URL exigida ANTES de chamar a
 *   plataforma (quando já se sabe que falta) e, se ela recusar pedindo URL, reabre o diálogo.
 *   Demais falhas: toast (o card já voltou).
 * - Rascunho numa coluna do Go! Sipal: abre a confirmação de envio (`sendRequest`).
 */
export function useTaskMoveFlow(columns: readonly BoardColumnView[]) {
    const mutation = useMoveTask()
    const [pending, setPending] = useState<PendingUrlMove | null>(null)
    const [dialogError, setDialogError] = useState<string | null>(null)
    const [sendRequest, setSendRequest] = useState<SendDraftRequest | null>(null)

    const labelOf = useCallback(
        (key: string) => columns.find((column) => column.key === key)?.label ?? TASK_STATUS_LABELS[key as TaskStatus] ?? key,
        [columns],
    )

    const run = useCallback(
        async (task: TaskDto, target: string, order: number | undefined, urls: { commitUrl?: string; pullRequestUrl?: string }) => {
            try {
                await mutation.mutateAsync({ task, target, targetLabel: labelOf(target), order, ...urls })
                setPending(null)
                setDialogError(null)
                return true
            } catch (error) {
                const failure = moveFailureOf(error)
                if (failure.requires && !isCustomColumnKey(target)) {
                    setPending({ task, targetStatus: target as TaskStatus, order, requires: failure.requires })
                    setDialogError(urls.commitUrl || urls.pullRequestUrl ? failure.message : null)
                } else {
                    toast.error(failure.message)
                }
                return false
            }
        },
        [mutation, labelOf],
    )

    const move = useCallback(
        (task: TaskDto, target: string, order?: number) => {
            const current = columnKeyOf(task)
            if (current === target && order === undefined) return
            if (isCustomColumnKey(target)) {
                void run(task, target, order, {})
                return
            }
            const status = target as TaskStatus
            if (task.draft) {
                if (DRAFT_SENDABLE_STATUSES.includes(status)) setSendRequest({ task, status: status as CreatableTaskStatus })
                else toast.error(DRAFT_BLOCKED_MESSAGE)
                return
            }
            if (task.status === FINAL_TASK_STATUS && status !== FINAL_TASK_STATUS) {
                toast.error("Tarefas em Produção não voltam para outras colunas do Go! Sipal")
                return
            }
            const requires = task.status === status ? null : requiredUrlFor(task, status)
            if (requires) {
                setDialogError(null)
                setPending({ task, targetStatus: status, order, requires })
                return
            }
            void run(task, status, order, {})
        },
        [run],
    )

    const confirmUrl = useCallback(
        async (url: string) => {
            if (!pending) return false
            return run(pending.task, pending.targetStatus, pending.order, pending.requires === "commit" ? { commitUrl: url } : { pullRequestUrl: url })
        },
        [pending, run],
    )

    const cancel = useCallback(() => {
        setPending(null)
        setDialogError(null)
    }, [])

    const request = useMemo<MoveUrlRequest | null>(
        () =>
            pending && {
                key: `${pending.task.id}:${pending.targetStatus}`,
                requires: pending.requires,
                targetStatus: pending.targetStatus,
                subject: pending.task.code,
                currentUrl: pending.requires === "commit" ? pending.task.commitUrl : pending.task.pullRequestUrl,
            },
        [pending],
    )

    return {
        move,
        pending,
        request,
        confirmUrl,
        cancel,
        dialogError,
        submitting: mutation.isPending,
        movingId: mutation.isPending ? (mutation.variables?.task.id ?? null) : null,
        sendRequest,
        closeSend: useCallback(() => setSendRequest(null), []),
    }
}
