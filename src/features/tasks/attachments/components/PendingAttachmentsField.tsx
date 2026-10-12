"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import { apiErrorMessage } from "@/lib/api"
import type { PendingAttachments } from "../hooks"
import type { TaskAttachmentDto } from "../types"
import { AttachmentList } from "./AttachmentList"
import { AttachmentDropzone } from "./AttachmentDropzone"
import { AttachmentQueue } from "./AttachmentQueue"

/**
 * Anexos do **formulário de criação** (tarefa do dono ou rascunho de prévia). Os arquivos são
 * enviados antes de o registro existir (ficam pendentes) e os ids vão no salvamento
 * (`attachmentIds`) — inclusive a mídia colada na descrição, que entra na mesma lista.
 */
export function PendingAttachmentsField({ state }: { state: PendingAttachments }) {
    const [removing, setRemoving] = useState(false)

    const onDelete = useCallback(
        async (attachment: TaskAttachmentDto) => {
            setRemoving(true)
            try {
                await state.remove(attachment)
            } catch (error) {
                toast.error(apiErrorMessage(error, "Não foi possível remover o anexo"))
            } finally {
                setRemoving(false)
            }
        },
        [state],
    )

    return (
        <div className="space-y-4">
            <AttachmentDropzone onFiles={state.upload}>
                <AttachmentQueue items={state.items} onCancel={state.cancel} onRetry={state.retry} onDismiss={state.dismiss} />
            </AttachmentDropzone>
            <AttachmentList attachments={state.attachments} canDelete deleting={removing} onDelete={(attachment) => void onDelete(attachment)} />
        </div>
    )
}
