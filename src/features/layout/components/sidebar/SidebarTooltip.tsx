"use client"

import type { ReactElement } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * Dica acessível (mouse e foco por teclado) com o nome do item quando o menu está recolhido —
 * no lugar do `title`, que leitor de tela e teclado não alcançam. Expandido, não envolve nada.
 */
export function SidebarTooltip({ label, enabled, children }: { label: string; enabled: boolean; children: ReactElement }) {
    if (!enabled) return children
    return (
        <TooltipProvider delayDuration={150}>
            <Tooltip>
                <TooltipTrigger asChild>{children}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
