"use client"

import type { ReactNode } from "react"
import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface InfoTooltipProps {
    /** Explicação mostrada ao passar o mouse ou focar o ícone. */
    text: ReactNode
    /** Nome do que é explicado (rótulo acessível: "Sobre <label>"). */
    label?: string
    side?: "top" | "right" | "bottom" | "left"
    className?: string
    /** Classes da dica (ex.: mais larga para um texto longo). */
    contentClassName?: string
}

/** Ícone de informação com tooltip: explica um campo, parâmetro, escopo ou status ao lado do rótulo. */
export function InfoTooltip({ text, label, side = "top", className, contentClassName }: InfoTooltipProps) {
    return (
        <TooltipProvider delayDuration={150}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        aria-label={label ? `Sobre ${label}` : "Mais informações"}
                        className={cn("inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
                    >
                        <Info className="h-3.5 w-3.5" aria-hidden />
                    </button>
                </TooltipTrigger>
                <TooltipContent side={side} className={cn("max-w-xs text-xs leading-relaxed", contentClassName)}>
                    {text}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

interface LabelWithInfoProps {
    children: ReactNode
    info?: ReactNode
    htmlFor?: string
    className?: string
}

/** Rótulo de campo com o ícone de informação ao lado. */
export function LabelWithInfo({ children, info, htmlFor, className }: LabelWithInfoProps) {
    return (
        <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", className)}>
            {htmlFor ? <label htmlFor={htmlFor}>{children}</label> : <span>{children}</span>}
            {info && <InfoTooltip text={info} label={typeof children === "string" ? children : undefined} />}
        </span>
    )
}
