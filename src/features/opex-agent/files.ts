import { CHAT_FILE_KIND_LABELS, CHAT_FILE_KINDS, chatFileKind, megabytesToBytes, type ChatFileKind } from "@/lib/chat-files/kind"
import { formatAttachmentSize } from "@/lib/attachments"
import { OPEX_FILE_CONTENT_MAX_BYTES, OPEX_FILE_TEXT_MAX_BYTES, type OpexProviderId } from "./constants"

/**
 * Arquivos do chat (módulo puro: tela e servidor). O tipo decide como o arquivo chega ao modelo:
 * conteúdo (imagem/PDF/áudio/vídeo como parte do pedido, texto inline) ou só a referência — o
 * agente ainda pode anexá-lo a tarefas e prévias pelo `fileId`. Tipo, rótulos e limites vêm do
 * módulo compartilhado `@/lib/chat-files` (também usado pela mesa de trabalho).
 */

export const OPEX_FILE_KINDS = CHAT_FILE_KINDS
export type OpexFileKind = ChatFileKind

/** Tipo do arquivo pelo MIME, com a extensão como reserva (o navegador nem sempre informa o MIME). */
export const opexFileKind = chatFileKind

/** Como cada provedor recebe cada tipo: parte de arquivo (`content`), texto inline ou só referência. */
export type OpexFileDelivery = "content" | "inline-text" | "reference"

const PROVIDER_KINDS: Record<OpexProviderId, ReadonlySet<OpexFileKind>> = {
    gemini: new Set(["image", "pdf", "audio", "video"]),
    anthropic: new Set(["image", "pdf"]),
    openai: new Set(["image", "pdf"]),
    deepseek: new Set(),
}

/**
 * Entrega do arquivo ao modelo. Arquivos acima do teto (`OPEX_FILE_CONTENT_MAX_BYTES` para conteúdo,
 * `OPEX_FILE_TEXT_MAX_BYTES` para texto) não são baixados do storage no turno: vão só como referência.
 */
export function opexFileDelivery(provider: OpexProviderId, kind: OpexFileKind, size = 0): OpexFileDelivery {
    if (kind === "text") return size > OPEX_FILE_TEXT_MAX_BYTES ? "reference" : "inline-text"
    if (!PROVIDER_KINDS[provider].has(kind)) return "reference"
    return size > OPEX_FILE_CONTENT_MAX_BYTES ? "reference" : "content"
}

/** Peso aproximado (em caracteres) do arquivo no orçamento do histórico. */
export function opexFileWeight(kind: OpexFileKind, size: number): number {
    if (kind === "image") return 8_000
    if (kind === "text") return Math.min(size, 100_000)
    if (kind === "pdf") return Math.min(Math.round(size / 3), 150_000)
    if (kind === "audio" || kind === "video") return Math.min(Math.round(size / 10), 150_000)
    return 300
}

/** Rota do app que serve o arquivo (sem `basePath`). */
export const opexFilePath = (id: string, download = false) => `/api/opex/files/${id}${download ? "?download=1" : ""}`

export const OPEX_FILE_KIND_LABELS = CHAT_FILE_KIND_LABELS

/** Linha de referência enviada ao modelo junto (ou no lugar) do conteúdo. */
export function opexFileReference(file: { id: string; name: string; mediaType: string; size: number; kind: OpexFileKind }, delivery: OpexFileDelivery): string {
    const base = `[Arquivo do chat: "${file.name}" (${OPEX_FILE_KIND_LABELS[file.kind]}, ${file.mediaType}, ${formatAttachmentSize(file.size)}) — fileId ${file.id}`
    if (delivery === "reference") return `${base}. O conteúdo não foi enviado ao modelo (tipo não lido pelo modelo atual ou arquivo grande demais); ele pode ser anexado a tarefas e prévias pelo fileId.]`
    return `${base}]`
}

/** Limite de tamanho configurado, em bytes. */
export const opexMaxBytes = megabytesToBytes
