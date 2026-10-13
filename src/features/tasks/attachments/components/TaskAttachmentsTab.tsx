"use client"

import { useCallback, useMemo } from "react"
import { apiErrorMessage } from "@/lib/api"
import type { TaskDetailDto } from "../../types"
import { useAttachmentsRealtime, useDeleteAttachment, useOwnerAttachmentClient, useTaskAttachments } from "../hooks"
import type { TaskAttachmentDto } from "../types"
import { AttachmentList } from "./AttachmentList"
import { AttachmentUploader } from "./AttachmentUploader"

/**
 * Aba **Anexos** da página da tarefa (dono): envia (arrastar/soltar), lista, baixa e exclui. Também é
 * o bloco de anexos do formulário de edição da tarefa.
 */
export function TaskAttachmentsTab({ task }: { task: TaskDetailDto }) {
    useAttachmentsRealtime()
    const client = useOwnerAttachmentClient()
    const target = useMemo(() => ({ taskId: task.id }), [task.id])
    const query = useTaskAttachments(client, target)
    const remove = useDeleteAttachment(client)
    const onDelete = useCallback((attachment: TaskAttachmentDto) => remove.mutate(attachment), [remove])

    return (
        <div className="space-y-4">
            <AttachmentUploader client={client} target={target} />
            <AttachmentList
                attachments={query.data ?? []}
                description={task.description}
                canDelete
                deleting={remove.isPending}
                loading={query.isLoading}
                error={query.isError ? apiErrorMessage(query.error, "Não foi possível carregar os anexos") : null}
                onRetry={() => void query.refetch()}
                onDelete={onDelete}
            />
        </div>
    )
}
