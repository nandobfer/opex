import { File, FileAudio, FileCode, FileImage, FileText, FileVideo, type LucideIcon } from "lucide-react"
import type { ChatFileKind } from "@/lib/chat-files/kind"

export const CHAT_FILE_ICONS: Record<ChatFileKind, LucideIcon> = {
    image: FileImage,
    pdf: FileText,
    text: FileCode,
    audio: FileAudio,
    video: FileVideo,
    other: File,
}

/** Ícone do tipo de arquivo; tipo desconhecido usa o genérico. */
export const fileIcon = (kind: ChatFileKind): LucideIcon => CHAT_FILE_ICONS[kind] ?? File
