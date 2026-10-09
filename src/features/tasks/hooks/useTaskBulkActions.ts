"use client"

import { useCallback, useState } from "react"
import { planBulkArchive, planBulkAssign, planBulkDiscard, planBulkMove, planBulkPriority, bulkMoveUrlNeed, type BulkPlan } from "../bulk-items"
import { isCustomColumnKey, type BoardColumnView } from "../board"
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, type TaskPriority, type TaskStatus } from "../constants"
import { DRAFT_SENDABLE_STATUSES } from "../drafts"
import type { MoveUrlRequest } from "../components/MoveUrlDialog"
import type { PersonRef, TaskDto } from "../types"
import { useBulkTasks } from "./useBulkTasks"

/** Rascunhos que um "Mover" em lote vai enviar ao Go! Sipal (pede confirmação antes). */
export interface BulkSendRequest {
    tasks: TaskDto[]
    target: TaskStatus
    drafts: number
}

/**
 * Ações em lote das tarefas selecionadas (barra flutuante e arraste múltiplo no kanban). Mover para
 * Validação/Aguardando Produção pede UMA URL para todas que precisam; mover rascunhos para uma
 * coluna do Go! Sipal pede confirmação (envia). Ao terminar, as que deram certo saem da seleção;
 * as que falharam continuam selecionadas.
 */
export function useTaskBulkActions(onSucceeded: (ids: string[]) => void, columns: readonly BoardColumnView[]) {
    const bulk = useBulkTasks()
    const [urlRequest, setUrlRequest] = useState<(MoveUrlRequest & { tasks: TaskDto[] }) | null>(null)
    const [sendRequest, setSendRequest] = useState<BulkSendRequest | null>(null)
    const labelOf = useCallback((key: string) => columns.find((column) => column.key === key)?.label ?? TASK_STATUS_LABELS[key as TaskStatus] ?? key, [columns])

    const execute = useCallback(
        (label: string, plan: BulkPlan) =>
            bulk.run(label, plan.items, {
                undoable: true,
                note: plan.note,
                onDone: (results) => onSucceeded(results.filter((result) => result.ok).map((result) => result.id)),
            }),
        [bulk, onSucceeded],
    )

    const proceedMove = useCallback(
        (tasks: TaskDto[], target: string) => {
            const need = bulkMoveUrlNeed(tasks, target)
            if (need) {
                setUrlRequest({
                    key: `bulk:${target}:${tasks.map((task) => task.id).join(",")}`,
                    requires: need.requires,
                    targetStatus: target as TaskStatus,
                    subject: need.count === 1 ? "1 tarefa" : `${need.count} tarefas`,
                    currentUrl: null,
                    bulk: true,
                    tasks,
                })
                return
            }
            void execute(`Mover para ${labelOf(target)}`, planBulkMove(tasks, target))
        },
        [execute, labelOf],
    )

    const move = useCallback(
        (tasks: TaskDto[], target: string) => {
            const drafts = tasks.filter((task) => task.draft).length
            if (drafts > 0 && !isCustomColumnKey(target) && DRAFT_SENDABLE_STATUSES.includes(target as TaskStatus)) {
                setSendRequest({ tasks, target: target as TaskStatus, drafts })
                return
            }
            proceedMove(tasks, target)
        },
        [proceedMove],
    )

    const confirmSend = useCallback(() => {
        if (!sendRequest) return
        setSendRequest(null)
        proceedMove(sendRequest.tasks, sendRequest.target)
    }, [sendRequest, proceedMove])

    const confirmUrl = useCallback(
        async (url: string) => {
            if (!urlRequest) return false
            const { tasks, targetStatus } = urlRequest
            setUrlRequest(null)
            await execute(`Mover para ${TASK_STATUS_LABELS[targetStatus]}`, planBulkMove(tasks, targetStatus, url))
            return true
        },
        [urlRequest, execute],
    )

    const assign = useCallback(
        (tasks: TaskDto[], person: PersonRef | null) => void execute(person ? `Atribuir a ${person.name}` : "Remover responsável", planBulkAssign(tasks, person)),
        [execute],
    )
    const prioritize = useCallback(
        (tasks: TaskDto[], priority: TaskPriority) => void execute(`Prioridade ${TASK_PRIORITY_LABELS[priority].toLowerCase()}`, planBulkPriority(tasks, priority)),
        [execute],
    )
    const archive = useCallback((tasks: TaskDto[], value: boolean) => void execute(value ? "Arquivar" : "Desarquivar", planBulkArchive(tasks, value)), [execute])
    const discard = useCallback((tasks: TaskDto[]) => void execute("Descartar rascunhos", planBulkDiscard(tasks)), [execute])

    return {
        move,
        assign,
        prioritize,
        archive,
        discard,
        progress: bulk.progress,
        running: bulk.running,
        urlRequest,
        confirmUrl,
        cancelUrl: () => setUrlRequest(null),
        sendRequest,
        confirmSend,
        cancelSend: () => setSendRequest(null),
    }
}
