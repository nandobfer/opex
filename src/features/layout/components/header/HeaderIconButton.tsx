"use client"

import { forwardRef, type ComponentPropsWithoutRef } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

/** Moldura dos botões do cabeçalho do celular: área de toque de 44px, foco visível. */
export const HEADER_ICON_BUTTON_CLASS =
    "relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** Com a barra recolhida o botão flutua sobre o conteúdo: ganha fundo, borda e sombra. */
export const HEADER_ICON_BUTTON_FLOATING_CLASS = "border-border bg-card/90 shadow-lg backdrop-blur"
const HEADER_ICON_BUTTON_FLAT_CLASS = "border-transparent bg-transparent"

type HeaderIconButtonProps = Omit<ComponentPropsWithoutRef<"button">, "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd" | "aria-label"> & {
    /** Rótulo acessível obrigatório: o ícone sozinho não basta. */
    "aria-label": string
    /** Barra recolhida (botão sobre o conteúdo). */
    floating?: boolean
    /** Estado ativo (painel do botão aberto). */
    active?: boolean
}

/** Botão de ícone do cabeçalho do celular (menu, Agente, Servidor). */
export const HeaderIconButton = forwardRef<HTMLButtonElement, HeaderIconButtonProps>(function HeaderIconButton({ floating = false, active = false, className, type = "button", ...props }, ref) {
    const reduceMotion = useReducedMotion() ?? false
    return (
        <motion.button
            ref={ref}
            type={type}
            whileTap={reduceMotion ? undefined : { scale: 0.92 }}
            data-floating={floating || undefined}
            className={cn(HEADER_ICON_BUTTON_CLASS, floating ? HEADER_ICON_BUTTON_FLOATING_CLASS : HEADER_ICON_BUTTON_FLAT_CLASS, active && "text-foreground", className)}
            {...props}
        />
    )
})
