"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface TooltipIconButtonProps {
    /** Nome acessível (e texto da dica quando `tooltip` não é informado). */
    label: string
    /** Conteúdo da dica; padrão: `label`. */
    tooltip?: ReactNode
    /** Bloqueia a ação e mostra o motivo na dica (continua focável). */
    disabledReason?: string | null
    /** Vira link: interno (`next/link`) ou, com `external`, nova aba. */
    href?: string
    external?: boolean
    onClick?: () => void
    className?: string
    /** Ícone (e extras, como o número da issue). */
    children: ReactNode
}

/**
 * Botão de ícone com contorno e dica (cabeçalhos das páginas de tarefa). Bloqueado usa `aria-disabled`
 * em vez de `disabled` para continuar recebendo foco/hover e a dica explicar o motivo.
 */
export function TooltipIconButton({ label, tooltip, disabledReason, href, external, onClick, className, children }: TooltipIconButtonProps) {
    const blocked = Boolean(disabledReason)
    const classes = cn("h-9 min-w-9 px-2.5 [&_svg]:size-4", blocked && "cursor-not-allowed opacity-50", className)

    const trigger =
        href && !blocked ? (
            <Button asChild variant="outline" className={classes}>
                {external ? (
                    <a href={href} target="_blank" rel="noreferrer noopener" aria-label={label}>
                        {children}
                    </a>
                ) : (
                    <Link href={href} aria-label={label}>
                        {children}
                    </Link>
                )}
            </Button>
        ) : (
            <Button type="button" variant="outline" className={classes} aria-label={label} aria-disabled={blocked || undefined} onClick={() => !blocked && onClick?.()}>
                {children}
            </Button>
        )

    return (
        <TooltipProvider delayDuration={200}>
            <Tooltip>
                <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">{disabledReason ?? tooltip ?? label}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
