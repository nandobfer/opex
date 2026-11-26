"use client"

import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { validateMediaFile } from "@/features/evolution-api/chat-media-rules"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import { draftsFromFiles, type AttachKind } from "../../chat-attachments"
import { useSendChatMessage, type AttachmentDraft, type QuotedRef } from "../../hooks/useSendChatMessage"
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder"
import { AttachmentPreviewDialog } from "./composer/AttachmentPreviewDialog"
import { ChatDropzone } from "./composer/ChatDropzone"
import { Composer } from "./composer/Composer"
import { ContactShareDialog } from "./composer/ContactShareDialog"
import { LocationDialog } from "./composer/LocationDialog"
import { ReplyBar } from "./composer/ReplyBar"

interface ConversationWorkspaceProps {
    chatId: string
    contacts: EvolutionContactDto[]
    disabled: boolean
    disabledReason?: ReactNode
    replyTo: QuotedRef | null
    replyAuthor: string
    onCancelReply: () => void
    /** A linha do tempo (recebe a área de soltar arquivos). */
    children: ReactNode
}

/**
 * Linha do tempo + compositor + fluxos de envio (cópia do Atendimento, sem CRM): anexos com prévia, voz, contato e
 * localização. Toda mensagem leva a citação ativa e a limpa.
 */
export function ConversationWorkspace({ chatId, contacts, disabled, disabledReason, replyTo, replyAuthor, onCancelReply, children }: ConversationWorkspaceProps) {
    const [drafts, setDrafts] = useState<AttachmentDraft[]>([])
    const [dialog, setDialog] = useState<"contact" | "location" | null>(null)
    const recorder = useVoiceRecorder()
    const send = useSendChatMessage(chatId)

    const addFiles = (files: File[], kind: AttachKind = "media") => {
        if (disabled) return
        const { drafts: next, errors } = draftsFromFiles(files, kind, drafts.length)
        errors.forEach((message) => toast.error(message))
        if (next.length) setDrafts((current) => [...current, ...next])
    }
    const done = () => onCancelReply()

    const sendVoice = async () => {
        const recording = await recorder.stop()
        if (!recording) return toast.error("Não foi possível gravar o áudio. Tente novamente.")
        const check = validateMediaFile({ mimeType: recording.file.type, fileName: recording.file.name, size: recording.file.size }, "audio")
        if (!check.ok) return toast.error(check.message)
        send.sendFiles([{ id: recording.file.name, file: recording.file, mediaType: "audio", mimeType: check.mimeType, voice: true, durationSeconds: recording.durationSeconds }], replyTo)
        done()
    }

    return (
        <>
            <ChatDropzone disabled={disabled} onFiles={(files) => addFiles(files)}>
                {children}
            </ChatDropzone>
            <Composer
                disabled={disabled}
                disabledReason={disabledReason}
                onSend={(text) => {
                    send.sendText(text, replyTo)
                    done()
                }}
                onFiles={addFiles}
                onContact={() => setDialog("contact")}
                onLocation={() => setDialog("location")}
                recorder={recorder}
                onVoiceSend={() => void sendVoice()}
                replyBar={<ReplyBar replyTo={replyTo} authorLabel={replyAuthor} onCancel={onCancelReply} />}
            />
            <AttachmentPreviewDialog
                drafts={drafts}
                onChange={setDrafts}
                onAddFiles={(files) => addFiles(files)}
                onSend={() => {
                    send.sendFiles(drafts, replyTo)
                    setDrafts([])
                    done()
                }}
                onCancel={() => setDrafts([])}
            />
            <ContactShareDialog
                open={dialog === "contact"}
                onOpenChange={(open) => setDialog(open ? "contact" : null)}
                contacts={contacts}
                onSend={(list) => {
                    send.sendContacts(list, replyTo)
                    done()
                }}
            />
            <LocationDialog
                open={dialog === "location"}
                onOpenChange={(open) => setDialog(open ? "location" : null)}
                onSend={(input) => {
                    send.sendLocation(input, replyTo)
                    done()
                }}
            />
        </>
    )
}
