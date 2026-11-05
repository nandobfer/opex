import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

/** Área de leitura do texto completo de uma memória: largura de leitura, tipografia confortável e rolagem interna. */
export const MEMORY_READING_TEXT_CLASS = "max-h-[40vh] max-w-prose overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-background/40 px-3 py-2.5 text-sm leading-relaxed"

/** Texto completo da memória (detalhe do Mentor e painel dos avisos da mesa). */
export function MemoryReadingText({ children, className, label = "Texto completo da memória" }: { children: ReactNode; className?: string; label?: string }) {
    return (
        <div aria-label={label} className={cn(MEMORY_READING_TEXT_CLASS, className)}>
            {children}
        </div>
    )
}

/** O Engramind ainda gera o título: o texto exibido é provisório. */
export function MemorySummaryPending() {
    return (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Resumo sendo gerado pelo Engramind…
        </p>
    )
}
