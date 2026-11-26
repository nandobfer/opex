"use client"

import { cn } from "@/lib/utils"

interface QuotedPreviewProps {
    /** Autor já resolvido ("Você", o nome do contato ou do participante). */
    author: string
    text: string
    onClick?: () => void
    className?: string
}

/** Mensagem citada: barra colorida, autor e prévia (no balão e na barra de resposta do compositor). */
export function QuotedPreview({ author, text, onClick, className }: QuotedPreviewProps) {
    const content = (
        <>
            <span className="absolute inset-y-0 left-0 w-1 bg-[var(--chart-info-1)]" aria-hidden />
            <span className="block truncate text-xs font-semibold">{author}</span>
            <span className="line-clamp-2 break-words text-xs opacity-75">{text || "Mensagem"}</span>
        </>
    )
    const classes = cn("relative block w-full overflow-hidden rounded-md bg-foreground/10 py-1 pl-3 pr-2 text-left", className)
    return onClick ? (
        <button type="button" onClick={onClick} className={cn(classes, "hover:bg-foreground/15")} aria-label={`Ir para a mensagem citada de ${author}`}>
            {content}
        </button>
    ) : (
        <div className={classes}>{content}</div>
    )
}
