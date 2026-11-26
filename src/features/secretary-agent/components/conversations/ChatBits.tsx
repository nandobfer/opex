import { Camera, FileText, Headphones, MapPin, Mic, Sticker, UserRound, Video } from "lucide-react"
import { cn } from "@/lib/utils"

/** Peças pequenas da aba Conversas, no padrão do Atendimento: divisor de data, contador de não lidas e ícone da prévia. */

export function DateDivider({ label }: { label: string }) {
    return (
        <div className="sticky top-1 z-10 my-2 flex justify-center" role="separator" aria-label={label}>
            <span className="rounded-md bg-card/95 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground shadow-sm">{label}</span>
        </div>
    )
}

/** Não lidas do WhatsApp (decisão D6: só mostra; abrir no Opex não marca como lida). */
export function UnreadBadge({ total }: { total: number }) {
    return (
        <span data-unread="" className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground" aria-label={`${total} não lidas`}>
            {total > 99 ? "99+" : total}
        </span>
    )
}

const ICON = "h-3.5 w-3.5 shrink-0"

/** Ícone antes da prévia da última mensagem (`kind` do cache de contatos ou da citação). */
export function PreviewIcon({ kind, className }: { kind: string | null | undefined; className?: string }) {
    const css = cn(ICON, className)
    switch (kind) {
        case "image":
            return <Camera className={css} aria-hidden />
        case "video":
            return <Video className={css} aria-hidden />
        case "voice":
            return <Mic className={css} aria-hidden />
        case "audio":
            return <Headphones className={css} aria-hidden />
        case "document":
            return <FileText className={css} aria-hidden />
        case "sticker":
            return <Sticker className={css} aria-hidden />
        case "location":
            return <MapPin className={css} aria-hidden />
        case "contact":
            return <UserRound className={css} aria-hidden />
        default:
            return null
    }
}
