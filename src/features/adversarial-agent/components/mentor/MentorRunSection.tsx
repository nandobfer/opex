import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** Seção do detalhe de uma execução do Mentor: ícone, título e conteúdo em largura total. */
export function MentorRunSection({ icon: Icon, title, aside, className, children }: { icon: LucideIcon; title: string; aside?: React.ReactNode; className?: string; children: React.ReactNode }) {
    return (
        <section aria-label={title} className={cn("space-y-2", className)}>
            <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <h3 className="text-sm font-medium">{title}</h3>
                {aside && <div className="ml-auto flex flex-wrap items-center gap-1.5">{aside}</div>}
            </header>
            <div className="min-w-0 space-y-1.5 break-words pl-6 text-sm">{children}</div>
        </section>
    )
}

/** Motivo de uma etapa (texto longo do modelo): parágrafo com quebra de linha preservada. */
export function MentorRunReason({ children }: { children: React.ReactNode }) {
    return <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{children}</p>
}

/** Chip discreto (metadado, gatilho). */
export function MentorRunChip({ icon: Icon, children, label }: { icon?: LucideIcon; children: React.ReactNode; label?: string }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground" title={label}>
            {Icon && <Icon className="h-3 w-3" aria-hidden />}
            {children}
        </span>
    )
}
