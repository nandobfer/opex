"use client"

import { useMemo } from "react"
import { apiErrorMessage } from "@/lib/api"
import { AttachmentList } from "@/features/tasks/attachments/components/AttachmentList"
import { AttachmentUploader } from "@/features/tasks/attachments/components/AttachmentUploader"
import { useTaskAttachments } from "@/features/tasks/attachments/hooks"
import type { ClienteTaskDetailDto } from "../../types"
import { useClienteAttachmentClient } from "../hooks"

/**
 * Aba **Anexos** do portal: o cliente envia (arrastar/soltar) e baixa os anexos das tarefas dele.
 * A exclusão de anexo vinculado é só do dono (o portal não tem esse botão).
 */
export function ClienteAttachmentsSection({ task }: { task: ClienteTaskDetailDto }) {
    const client = useClienteAttachmentClient()
    const target = useMemo(() => ({ taskId: task.id }), [task.id])
    const query = useTaskAttachments(client, target)

    return (
        <div className="space-y-4">
            <AttachmentUploader client={client} target={target} />
            <AttachmentList
                attachments={query.data ?? []}
                description={task.description}
                loading={query.isLoading}
                error={query.isError ? apiErrorMessage(query.error, "Não foi possível carregar os anexos") : null}
                onRetry={() => void query.refetch()}
            />
        </div>
    )
}
