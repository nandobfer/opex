"use client"

import type { ImgHTMLAttributes } from "react"
import { parseAttachmentUrl } from "@/lib/attachments"
import { withBasePath } from "@/lib/base-path"
import { cn } from "@/lib/utils"

/**
 * Imagem de Markdown. Quando a referência é um **anexo do app**
 * (`/api/attachments/{id}/content`, com `#audio`/`#video` para mídia), o conteúdo vem da rota
 * autenticada — com o subcaminho público — e é renderizado como imagem, áudio ou vídeo. Nunca há
 * HTML cru: só elementos de mídia.
 */
/** Separa os `data-md-*` (offsets da cópia em Markdown), que vão no elemento mais externo. */
function splitSourceProps(props: Record<string, unknown>): { source: Record<string, unknown>; others: Record<string, unknown> } {
    const source: Record<string, unknown> = {}
    const others: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(props)) (key.startsWith("data-md-") ? source : others)[key] = value
    return { source, others }
}

export function MarkdownMedia({ src, alt, className, ...all }: ImgHTMLAttributes<HTMLImageElement>) {
    const { source, others } = splitSourceProps(all)
    const props = others as ImgHTMLAttributes<HTMLImageElement>
    const parsed = parseAttachmentUrl(typeof src === "string" ? src : null)
    // eslint-disable-next-line @next/next/no-img-element -- imagem arbitrária de Markdown; o otimizador do Next não cobre URLs de anexo.
    if (!parsed) return <img src={src} alt={alt} className={cn("my-2 max-h-80 rounded-md border", className)} {...props} {...source} />

    const url = withBasePath(`/api/attachments/${parsed.id}/content`)
    const label = alt?.trim() || "anexo"

    if (parsed.media === "audio" || parsed.media === "video") {
        return (
            <span className="my-2 flex flex-col gap-1" {...source}>
                {parsed.media === "video" ? (
                    <video controls preload="metadata" src={url} className="max-h-80 w-full rounded-md border bg-black" />
                ) : (
                    <audio controls preload="metadata" src={url} className="w-full" />
                )}
                <a href={url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                    {label}
                </a>
            </span>
        )
    }

    return (
        <a href={url} target="_blank" rel="noreferrer" className="inline-block" {...source}>
            {/* eslint-disable-next-line @next/next/no-img-element -- o conteúdo vem de rota autenticada do app. */}
            <img src={url} alt={label} loading="lazy" className={cn("my-2 max-h-80 rounded-md border", className)} {...props} />
        </a>
    )
}
