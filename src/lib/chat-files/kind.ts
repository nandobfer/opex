import { z } from "zod"

/**
 * Arquivos anexados a mensagens de agentes (módulo puro: tela e servidor). Compartilhado pelo chat
 * do Agente Opex e pelos campos da mesa de trabalho: tipo do arquivo, rótulos, limites e contratos
 * do envio em duas fases (reserva → PUT direto no Storage S3 → confirmação).
 */

export const CHAT_FILE_KINDS = ["image", "pdf", "text", "audio", "video", "other"] as const
export type ChatFileKind = (typeof CHAT_FILE_KINDS)[number]

const TEXT_EXTENSIONS = new Set([
    "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "log", "xml", "yml", "yaml", "toml", "ini", "env", "sql", "html", "htm", "css", "scss",
    "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "go", "rs", "java", "kt", "cs", "php", "sh", "bash", "zsh", "ps1", "vue", "svelte", "graphql", "gql", "diff", "patch",
])
const TEXT_MIMES = new Set(["application/json", "application/xml", "application/x-yaml", "application/yaml", "application/sql", "application/x-sh", "application/javascript", "application/typescript", "application/x-ndjson"])
/** Imagens que os provedores leem (SVG é conteúdo ativo e não entra). */
const MODEL_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"])

const extensionOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? ""

/** Tipo do arquivo pelo MIME, com a extensão como reserva (o navegador nem sempre informa o MIME). */
export function chatFileKind(mediaType: string | null | undefined, name: string): ChatFileKind {
    const mime = (mediaType ?? "").split(";")[0]!.trim().toLowerCase()
    const extension = extensionOf(name)
    if (MODEL_IMAGE_MIMES.has(mime) || ((!mime || mime === "application/octet-stream") && ["png", "jpg", "jpeg", "webp", "gif"].includes(extension))) return "image"
    if (mime === "application/pdf" || extension === "pdf") return "pdf"
    if (mime.startsWith("audio/")) return "audio"
    if (mime.startsWith("video/")) return "video"
    if (mime.startsWith("text/") || TEXT_MIMES.has(mime) || TEXT_EXTENSIONS.has(extension)) return "text"
    return "other"
}

export const CHAT_FILE_KIND_LABELS: Record<ChatFileKind, string> = {
    image: "imagem",
    pdf: "PDF",
    text: "texto",
    audio: "áudio",
    video: "vídeo",
    other: "arquivo",
}

/** Megabytes em bytes (limites configurados em MB). */
export const megabytesToBytes = (megabytes: number) => Math.round(megabytes * 1024 * 1024)

/** Limites do envio: arquivos por mensagem e tamanho máximo de cada um (MB). */
export interface ChatFilesLimits {
    maxPerMessage: number
    maxSizeMb: number
}

/** Arquivo confirmado (anexado a uma mensagem ou pronto para ir na próxima). */
export interface ChatFileDto {
    id: string
    name: string
    mediaType: string
    size: number
    kind: ChatFileKind
    /** Rota do conteúdo no app. */
    url: string
}

/** Reserva do envio direto ao Storage S3: o navegador faz o PUT e depois confirma. */
export interface ChatFileReservationDto {
    id: string
    method: "PUT"
    /** URL assinada (absoluta) do storage. */
    url: string
    /** Cabeçalhos obrigatórios do PUT (o `Content-Type` entra na assinatura). */
    headers: Record<string, string>
    expiresIn: number
}

/** Reserva do envio de um arquivo (o arquivo vai direto do navegador ao Storage S3). */
export const reserveChatFileSchema = z.object({
    name: z.string().trim().min(1, "Informe o nome do arquivo").max(300, "Nome muito longo"),
    size: z.number({ error: "Informe o tamanho do arquivo" }).int().min(1, "O arquivo está vazio"),
    mediaType: z.string().trim().max(200).optional(),
})
export type ReserveChatFileInput = z.infer<typeof reserveChatFileSchema>
