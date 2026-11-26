/**
 * Arquivos aceitos pelo WhatsApp no envio da aba Conversas do Secretário (OPE-197). Cópia das regras do Atendimento
 * do Zaturno CRM, sem figurinha (fora do escopo). Puro: usado no compositor e na rota.
 */

export const SENDABLE_MEDIA_TYPES = ["image", "video", "audio", "document"] as const
export type SendableMediaType = (typeof SENDABLE_MEDIA_TYPES)[number]

const MB = 1024 * 1024

export const MEDIA_RULES: Record<SendableMediaType, { mimes: readonly string[]; maxBytes: number; label: string }> = {
    image: { mimes: ["image/jpeg", "image/png"], maxBytes: 5 * MB, label: "Imagem (JPG ou PNG)" },
    video: { mimes: ["video/mp4", "video/3gpp"], maxBytes: 16 * MB, label: "Vídeo (MP4 ou 3GP)" },
    // `audio/webm`: gravação do navegador; a Evolution converte no envio de voz.
    audio: { mimes: ["audio/aac", "audio/amr", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/webm"], maxBytes: 16 * MB, label: "Áudio (MP3, OGG, AAC, AMR ou M4A)" },
    document: {
        mimes: [
            "application/pdf",
            "text/plain",
            "text/csv",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ],
        maxBytes: 100 * MB,
        label: "Documento (PDF, Word, Excel, PowerPoint, TXT ou CSV)",
    },
}

/** Tipos que aceitam legenda no WhatsApp. */
export const CAPTION_MEDIA_TYPES: readonly SendableMediaType[] = ["image", "video", "document"]
export const MAX_ATTACHMENTS = 10
export const MAX_CAPTION = 1024

const EXTENSION_MIMES: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    mp4: "video/mp4",
    "3gp": "video/3gpp",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    opus: "audio/ogg",
    webm: "audio/webm",
    aac: "audio/aac",
    amr: "audio/amr",
    m4a: "audio/mp4",
    pdf: "application/pdf",
    txt: "text/plain",
    csv: "text/csv",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

/** Tipo base, sem parâmetros (`audio/ogg; codecs=opus` → `audio/ogg`). */
export const baseMime = (mime: string) => mime.split(";")[0]!.trim().toLowerCase()

/** MIME do arquivo; sem tipo do navegador (comum em CSV/Office), deduz pela extensão. */
export function resolveMime(mime: string | null | undefined, fileName: string): string {
    const base = mime ? baseMime(mime) : ""
    if (base && base !== "application/octet-stream") return base
    const extension = fileName.split(".").pop()?.toLowerCase() ?? ""
    return EXTENSION_MIMES[extension] ?? base
}

export function mediaTypeForMime(mime: string): SendableMediaType | null {
    const base = baseMime(mime)
    for (const type of SENDABLE_MEDIA_TYPES) if (MEDIA_RULES[type].mimes.includes(base)) return type
    return null
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < MB) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0).replace(".", ",")} KB`
    return `${(bytes / MB).toFixed(1).replace(".", ",")} MB`
}

export type MediaValidation = { ok: true; mediaType: SendableMediaType; mimeType: string } | { ok: false; message: string }

/**
 * Classifica e valida um arquivo. `requested` força o tipo (ex.: arquivo escolhido em "Documento" ou a gravação de
 * voz). Imagem fora de JPG/PNG (HEIC, GIF, WEBP) é recusada com explicação.
 */
export function validateMediaFile(file: { mimeType: string | null | undefined; fileName: string; size: number }, requested?: SendableMediaType): MediaValidation {
    const mimeType = resolveMime(file.mimeType, file.fileName)
    const detected = mediaTypeForMime(mimeType)
    let mediaType: SendableMediaType | null = detected
    // Em "Documento" o WhatsApp só aceita os tipos de documento (foto/vídeo vão pela galeria).
    if (requested === "document" && detected !== "document") mediaType = null
    if (requested && requested !== "document" && detected !== requested) mediaType = null
    if (!mediaType) {
        if (requested === "document") return { ok: false, message: `“${file.fileName}” não é um documento aceito pelo WhatsApp. Use ${MEDIA_RULES.document.label}.` }
        if (mimeType.startsWith("image/")) return { ok: false, message: `“${file.fileName}”: o WhatsApp só aceita fotos JPG ou PNG.` }
        return { ok: false, message: `“${file.fileName}”: tipo de arquivo não aceito pelo WhatsApp.` }
    }
    if (file.size <= 0) return { ok: false, message: `“${file.fileName}” está vazio.` }
    const rule = MEDIA_RULES[mediaType]
    if (file.size > rule.maxBytes) return { ok: false, message: `“${file.fileName}” tem ${formatBytes(file.size)}; o limite para ${rule.label.split(" (")[0]!.toLowerCase()} é ${formatBytes(rule.maxBytes)}.` }
    return { ok: true, mediaType, mimeType }
}
