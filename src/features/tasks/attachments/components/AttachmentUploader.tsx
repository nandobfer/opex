"use client"

import type { ReactNode } from "react"
import { formatAttachmentSize } from "@/lib/attachments"
import type { AttachmentClient, AttachmentTarget } from "../client"
import { ATTACHMENT_MAX_BYTES } from "../constants"
import { useAttachmentUploads } from "../hooks"
import type { TaskAttachmentDto } from "../types"
import { AttachmentDropzone } from "./AttachmentDropzone"
import { AttachmentQueue } from "./AttachmentQueue"

/** Área de envio de anexos: arrastar/soltar + seleção múltipla + fila com progresso. */
export function AttachmentUploader({
    client,
    target,
    onUploaded,
    hint,
    disabled = false,
    children,
}: {
    client: AttachmentClient
    /** Destino do envio (tarefa ou rascunho); sem destino, o anexo fica pendente até a criação. */
    target?: AttachmentTarget
    onUploaded?: (attachment: TaskAttachmentDto) => void
    hint?: ReactNode
    disabled?: boolean
    children?: ReactNode
}) {
    const queue = useAttachmentUploads({ client, target, onUploaded })
    return (
        <AttachmentDropzone
            onFiles={queue.upload}
            disabled={disabled}
            hint={hint ?? `Qualquer tipo de arquivo, até ${formatAttachmentSize(ATTACHMENT_MAX_BYTES)} cada. A quantidade é ilimitada.`}
        >
            <AttachmentQueue items={queue.items} onCancel={queue.cancel} onRetry={queue.retry} onDismiss={queue.dismiss} />
            {children}
        </AttachmentDropzone>
    )
}
