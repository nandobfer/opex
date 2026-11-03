"use client"

import { useRef, useState, type ReactNode } from "react"
import { Settings2 } from "lucide-react"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"

interface ModelSettingsPopoverProps {
    id: string
    /** Nome acessível e dica do botão. */
    label: string
    /** Texto ao vivo da gravação ("Alterando: Implementação"), lido por leitores de tela. */
    liveText?: string | null
    className?: string
    children: ReactNode
}

/**
 * Botão de ícone (configuração) que abre o popover "Modelos por etapa" da mesa e do fork. O botão
 * é a âncora do popover (a dica do `TooltipIconButton` continua funcionando); clicar nele de novo fecha.
 */
export function ModelSettingsPopover({ id, label, liveText = null, className, children }: ModelSettingsPopoverProps) {
    const [open, setOpen] = useState(false)
    const anchor = useRef<HTMLSpanElement>(null)
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
                <span ref={anchor} className="inline-flex shrink-0" id={`${id}-trigger`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-content` : undefined}>
                    <TooltipIconButton label={label} className={className} onClick={() => setOpen((value) => !value)}>
                        <Settings2 aria-hidden />
                    </TooltipIconButton>
                </span>
            </PopoverAnchor>
            <PopoverContent
                id={`${id}-content`}
                role="dialog"
                aria-labelledby={`${id}-title`}
                align="start"
                side="top"
                collisionPadding={16}
                className="w-[min(30rem,calc(100vw-2rem))] p-0"
                // O clique no próprio botão alterna pelo `onClick` (sem fechar e reabrir).
                onInteractOutside={(event) => anchor.current?.contains(event.target as Node) && event.preventDefault()}
            >
                <div className="border-b px-4 py-3">
                    <h2 id={`${id}-title`} className="text-sm font-semibold">
                        Modelos por etapa
                    </h2>
                    <p className="text-xs text-muted-foreground">Vale a partir do próximo turno. Precedência: mesa &gt; central &gt; padrão global.</p>
                </div>
                <div className="max-h-[min(70vh,36rem)] space-y-2 overflow-y-auto p-3">{children}</div>
                <p className="sr-only" aria-live="polite">
                    {liveText ?? ""}
                </p>
            </PopoverContent>
        </Popover>
    )
}
