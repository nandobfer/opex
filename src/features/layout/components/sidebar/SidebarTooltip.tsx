"use client"

import { useState, type ReactElement } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * Dica acessível (mouse e foco por teclado) com o nome do item quando o menu está recolhido —
 * no lugar do `title`, que leitor de tela e teclado não alcançam. Expandido, não envolve nada.
 * `suppressed` esconde a dica sem desmontar o gatilho (ex.: com o painel do item aberto pelo hover).
 */
export function SidebarTooltip({ label, enabled, suppressed = false, children }: { label: string; enabled: boolean; suppressed?: boolean; children: ReactElement }) {
    const [open, setOpen] = useState(false)
    if (!enabled) return children
    return (
        <TooltipProvider delayDuration={150}>
            <Tooltip open={open && !suppressed} onOpenChange={setOpen}>
                <TooltipTrigger asChild>{children}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
