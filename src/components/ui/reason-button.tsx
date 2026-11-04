"use client"

import type { ButtonHTMLAttributes, ReactNode } from "react"
import { Button, type ButtonProps } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface ReasonButtonProps {
    /** Bloqueia a ação e mostra o motivo na dica (o botão continua focável, como `TooltipIconButton`). */
    disabledReason?: string | null
    /** Bloqueio sem dica (ex.: ação em andamento). */
    disabled?: boolean
    variant?: ButtonProps["variant"]
    size?: ButtonProps["size"]
    className?: string
    onClick?: () => void
    /** Atributos extras do `<button>` (ex.: `data-ctrl-enter-submit`). */
    buttonProps?: ButtonHTMLAttributes<HTMLButtonElement> & Record<`data-${string}`, string | boolean | undefined>
    children: ReactNode
}

/**
 * Botão com texto que, bloqueado, explica o motivo numa dica (OPE-137: "Refinar tarefa" e "Abrir mesa e
 * gerar o plano" da tela inicial da mesa). Bloqueado usa `aria-disabled` para receber foco/hover.
 */
export function ReasonButton({ disabledReason, disabled = false, variant, size, className, onClick, buttonProps, children }: ReasonButtonProps) {
    const blocked = Boolean(disabledReason)
    const button = (
        <Button
            type="button"
            variant={variant}
            size={size}
            className={cn("gap-1.5", blocked && "cursor-not-allowed opacity-50", className)}
            disabled={disabled}
            aria-disabled={blocked || undefined}
            onClick={() => !blocked && onClick?.()}
            {...buttonProps}
        >
            {children}
        </Button>
    )
    if (!blocked) return button
    return (
        <TooltipProvider delayDuration={200}>
            <Tooltip>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">{disabledReason}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
