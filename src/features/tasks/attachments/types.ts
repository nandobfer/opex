import type { AttachmentKind } from "@/lib/attachments"

/** Anexo como a tela o exibe. */
export interface TaskAttachmentDto {
    id: string
    name: string
    size: number
    mimeType: string
    /** Tipo de exibição derivado do mime (`file` = sempre download). */
    kind: AttachmentKind
    /** URL **estável** do conteúdo (sem `basePath`); a UI aplica o subcaminho público. */
    url: string
    /** Referência pronta para colar no Markdown da descrição. */
    markdown: string
    /** Nome exibido de quem enviou. */
    uploaderName: string
    /** Origem do envio. */
    uploaderKind: "owner" | "client"
    createdAt: string | null
}

export interface TaskAttachmentListDto {
    attachments: TaskAttachmentDto[]
}

/** Reserva de upload: onde e como o navegador deve enviar o arquivo. */
export interface AttachmentReservationDto {
    id: string
    method: "PUT"
    /** URL assinada (absoluta) do storage. */
    url: string
    /** Cabeçalhos obrigatórios do PUT (o `Content-Type` entra na assinatura). */
    headers: Record<string, string>
    expiresIn: number
}
