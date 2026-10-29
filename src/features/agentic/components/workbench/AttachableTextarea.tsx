"use client"

import type { ClipboardEvent, ComponentProps } from "react"
import { AttachButton } from "@/components/chat-attachments/AttachButton"
import { AttachmentChips } from "@/components/chat-attachments/AttachmentChips"
import { FileDropZone } from "@/components/chat-attachments/FileDropZone"
import { ReplyTextarea } from "@/components/agent-reply/ReplyTextarea"
import { cn } from "@/lib/utils"
import type { FieldAttachments } from "../../hooks/useWorkbenchFiles"

type AttachableTextareaProps = ComponentProps<typeof ReplyTextarea> & { attachments: FieldAttachments }

/**
 * Campo de texto da mesa que também aceita anexos (como o chat do Agente Opex): clipe no canto, colar
 * e arrastar arquivos; os chips mostram o envio antes de mandar. A colagem é capturada no contêiner
 * para valer também no modo Vim (o editor substitui o `textarea`). Sem fila montada, é só o campo.
 */
export function AttachableTextarea({ attachments, className, ...props }: AttachableTextareaProps) {
    if (!attachments.available) return <ReplyTextarea className={className} {...props} />
    const disabled = Boolean(props.disabled)
    const onPasteCapture = (event: ClipboardEvent<HTMLDivElement>) => {
        const files = Array.from(event.clipboardData?.files ?? [])
        if (!files.length || disabled) return
        event.preventDefault()
        event.stopPropagation()
        attachments.onFiles(files)
    }
    return (
        <FileDropZone onFiles={attachments.onFiles} disabled={disabled} className="relative" label="Solte para anexar" compact>
            <AttachmentChips items={attachments.items} onRetry={attachments.onRetry} onRemove={attachments.onRemove} />
            <div className="relative" onPasteCapture={onPasteCapture}>
                <ReplyTextarea className={cn("pr-11", className)} {...props} />
                <AttachButton onFiles={attachments.onFiles} disabled={disabled} className="absolute bottom-1.5 right-1.5" />
            </div>
        </FileDropZone>
    )
}
