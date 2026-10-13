"use client"

import { FileText, Film, Image as ImageIcon, Music } from "lucide-react"
import type { AttachmentKind } from "@/lib/attachments"
import { cn } from "@/lib/utils"

const ICONS: Record<AttachmentKind, typeof FileText> = { image: ImageIcon, video: Film, audio: Music, file: FileText }

/** Ícone do tipo do anexo (imagem, vídeo, áudio e arquivo). */
export function AttachmentKindIcon({ kind, className }: { kind: AttachmentKind; className?: string }) {
    const Icon = ICONS[kind]
    return <Icon className={cn("h-4 w-4", className)} aria-hidden />
}

/** Miniatura do anexo: prévia para imagem, ícone do tipo nos demais. */
export function AttachmentThumb({ kind, src, className }: { kind: AttachmentKind; src?: string | null; className?: string }) {
    return (
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40 text-muted-foreground", className)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- miniatura pequena de anexo (rota autenticada do app). */}
            {kind === "image" && src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <AttachmentKindIcon kind={kind} className="h-5 w-5" />}
        </span>
    )
}
