"use client"

import { useState } from "react"
import { Download, FileText, ImageOff, Play, RotateCcw } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { withBasePath } from "@/lib/base-path"
import { cn } from "@/lib/utils"
import type { ChatMessageDto } from "@/features/evolution-api/chat-message"
import { chatMediaPath, documentLabel, isTempId } from "../../../chat-timeline"
import { AudioPlayer } from "./AudioPlayer"

interface MediaContentProps {
    chatId: string
    message: ChatMessageDto
    /** Prévia local de um envio em andamento (blob). */
    previewUrl?: string | null
    onOpen?: (message: ChatMessageDto) => void
}

/** `src` da mídia: prévia local (otimista) → rota da conversa → nenhuma (ainda subindo). */
export function mediaSrc(chatId: string, message: ChatMessageDto, previewUrl?: string | null, attempt = 0): string | null {
    if (previewUrl) return previewUrl
    if (isTempId(message.id)) return null
    return withBasePath(chatMediaPath(chatId, message.id, attempt))
}

function Unavailable({ onRetry }: { onRetry: () => void }) {
    return (
        <div className="flex h-24 w-60 max-w-full flex-col items-center justify-center gap-1.5 rounded-md bg-foreground/5 text-center text-xs opacity-80" role="status">
            <ImageOff className="h-5 w-5" aria-hidden />
            Não foi possível carregar a mídia.
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold hover:underline">
                <RotateCcw className="h-3 w-3" aria-hidden /> Tentar novamente
            </button>
        </div>
    )
}

/** Foto, vídeo, figurinha, documento e áudio no padrão do WhatsApp Web (cópia do Atendimento, sem transcrição). */
export function MediaContent({ chatId, message, previewUrl, onOpen }: MediaContentProps) {
    const media = message.media
    const [attempt, setAttempt] = useState(0)
    const [failed, setFailed] = useState(false)
    const [loaded, setLoaded] = useState(false)
    if (!media) return null
    const out = message.fromMe
    const src = mediaSrc(chatId, message, previewUrl, attempt)
    const retry = () => {
        setFailed(false)
        setLoaded(false)
        setAttempt((value) => value + 1)
    }
    if (failed) return <Unavailable onRetry={retry} />

    if (media.kind === "document") {
        return (
            <div className={cn("relative flex w-72 max-w-full items-center gap-3 rounded-md p-2.5", out ? "bg-primary-foreground/15" : "bg-background/60")}>
                <span className="flex h-10 w-8 shrink-0 items-end justify-center rounded-sm bg-secondary pb-1 text-[9px] font-bold" aria-hidden>
                    {documentLabel(media.fileName, media.mimetype)}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{media.fileName ?? "Documento"}</p>
                    <p className="flex items-center gap-1 text-[11px] opacity-70">
                        <FileText className="h-3 w-3" aria-hidden /> {documentLabel(media.fileName, media.mimetype)}
                    </p>
                </div>
                {src && !previewUrl && (
                    <a href={src} download={media.fileName ?? true} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-current/40 opacity-80 hover:opacity-100" aria-label={`Baixar ${media.fileName ?? "documento"}`}>
                        <Download className="h-4 w-4" aria-hidden />
                    </a>
                )}
            </div>
        )
    }

    if (media.kind === "audio") {
        if (!src) return <Skeleton className="h-12 w-64" />
        return <AudioPlayer src={src} voice={media.voice} out={out} fallbackDuration={media.seconds} onError={() => setFailed(true)} />
    }

    const sticker = media.kind === "sticker"
    const box = sticker ? "h-40 w-40" : "max-h-[330px] w-[300px] max-w-full"
    return (
        <button
            type="button"
            onClick={() => !sticker && src && onOpen?.(message)}
            className={cn("relative block overflow-hidden rounded-md", sticker ? "cursor-default" : "cursor-zoom-in", !loaded && (sticker ? "h-40 w-40" : "h-48 w-[300px] max-w-full"))}
            aria-label={sticker ? "Figurinha" : media.kind === "video" ? "Abrir vídeo" : "Abrir foto"}
        >
            {!loaded && <Skeleton className="absolute inset-0" />}
            {src &&
                (media.kind === "video" ? (
                    <video src={src} preload="metadata" muted playsInline className={cn(box, "object-cover")} onLoadedData={() => setLoaded(true)} onError={() => setFailed(true)} />
                ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- rota autenticada/blob: sem otimização do Next
                    <img src={src} alt={message.text || (sticker ? "Figurinha" : "Foto")} className={cn(box, sticker ? "object-contain" : "object-cover")} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
                ))}
            {media.kind === "video" && loaded && (
                <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-background/60">
                        <Play className="h-6 w-6 fill-current" />
                    </span>
                </span>
            )}
        </button>
    )
}
