import { MAX_ATTACHMENTS, validateMediaFile, type SendableMediaType } from "@/features/evolution-api/chat-media-rules"
import type { AttachmentDraft } from "./hooks/useSendChatMessage"

/** Tipo escolhido no menu de anexos (define o `accept` e a validação). Módulo puro. */
export type AttachKind = "media" | "document" | "audio"

export const ACCEPT: Record<AttachKind, string> = {
    media: "image/jpeg,image/png,video/mp4,video/3gpp",
    document: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv",
    audio: "audio/mpeg,audio/ogg,audio/aac,audio/amr,audio/mp4,.mp3,.ogg,.m4a,.aac,.amr,.opus",
}

const REQUESTED: Record<AttachKind, SendableMediaType | undefined> = { media: undefined, document: "document", audio: "audio" }

let sequence = 0
const draftId = () => `draft-${Date.now().toString(36)}-${(sequence += 1)}`

/**
 * Arquivos escolhidos/soltos/colados → rascunhos válidos + erros em pt-BR. Respeita o limite de anexos por envio
 * (`MAX_ATTACHMENTS`), contando os que já estão na prévia. Cópia das regras do Atendimento do Zaturno CRM.
 */
export function draftsFromFiles(files: readonly File[], kind: AttachKind = "media", alreadySelected = 0): { drafts: AttachmentDraft[]; errors: string[] } {
    const drafts: AttachmentDraft[] = []
    const errors: string[] = []
    for (const file of files) {
        if (alreadySelected + drafts.length >= MAX_ATTACHMENTS) {
            errors.push(`Envie no máximo ${MAX_ATTACHMENTS} arquivos por vez.`)
            break
        }
        // Soltar/colar sem escolher o tipo: documento é aceito como documento.
        const requested = REQUESTED[kind] ?? (validateMediaFile({ mimeType: file.type, fileName: file.name, size: file.size }).ok ? undefined : "document")
        const check = validateMediaFile({ mimeType: file.type, fileName: file.name, size: file.size }, requested)
        if (!check.ok) {
            errors.push(check.message)
            continue
        }
        drafts.push({ id: draftId(), file, mediaType: check.mediaType, mimeType: check.mimeType })
    }
    return { drafts, errors }
}
