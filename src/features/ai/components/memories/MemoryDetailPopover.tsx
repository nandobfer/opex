"use client"

import type { ReactNode } from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { X } from "lucide-react"
import { usePortalContainer } from "@/components/ui/portal-container"
import { useHoverPopover } from "@/hooks/useHoverPopover"
import { cn } from "@/lib/utils"

/** Distância do painel até o texto do aviso e margem mínima até a borda da janela (px). */
export const MEMORY_DETAIL_OFFSET = 6
export const MEMORY_DETAIL_COLLISION_PADDING = 12

interface MemoryDetailPopoverProps {
    /** Texto do aviso (vira o gatilho). */
    children: ReactNode
    /** Nome acessível do painel. */
    label: string
    /** Conteúdo do painel; montado só com o painel aberto (a leitura da memória começa ao abrir). */
    content: () => ReactNode
    className?: string
}

/**
 * Detalhe de memória ao passar o mouse ou clicar (OPE-139): o hover abre a prévia e o clique a fixa
 * até Esc, clique fora, o botão de fechar ou outro clique no texto. Portal do Radix Popover (fora da
 * rolagem da Saída da IA), limitado à janela e animado com Framer Motion.
 */
export function MemoryDetailPopover({ children, label, content, className }: MemoryDetailPopoverProps) {
    const reduceMotion = useReducedMotion() ?? false
    const container = usePortalContainer()
    const { open, pinned, setOpen, toggle, triggerHandlers, panelHandlers, openedByHover } = useHoverPopover(undefined, { pinOnClick: true })
    return (
        <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
            <PopoverPrimitive.Trigger asChild>
                <button
                    type="button"
                    aria-label={`${label}: ver detalhes`}
                    className={cn("cursor-help whitespace-pre-wrap rounded-sm text-left underline decoration-dotted decoration-current/60 underline-offset-2 transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
                    onClick={(event) => {
                        event.preventDefault()
                        toggle()
                    }}
                    {...triggerHandlers}
                >
                    {children}
                </button>
            </PopoverPrimitive.Trigger>
            <AnimatePresence>
                {open && (
                    <PopoverPrimitive.Portal forceMount container={container}>
                        <PopoverPrimitive.Content
                            forceMount
                            asChild
                            side="bottom"
                            align="start"
                            sideOffset={MEMORY_DETAIL_OFFSET}
                            collisionPadding={MEMORY_DETAIL_COLLISION_PADDING}
                            aria-label={label}
                            onOpenAutoFocus={(event) => {
                                if (openedByHover.current) event.preventDefault()
                            }}
                            onCloseAutoFocus={(event) => {
                                if (openedByHover.current) event.preventDefault()
                            }}
                        >
                            <motion.div
                                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -4, scale: 0.97, transition: { duration: reduceMotion ? 0 : 0.15 } }}
                                transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
                                style={{ transformOrigin: "var(--radix-popover-content-transform-origin)" }}
                                className="relative z-50 w-[min(32rem,var(--radix-popover-content-available-width))] rounded-lg border bg-popover p-3 text-popover-foreground shadow-2xl shadow-primary/10"
                                data-testid="memory-detail-panel"
                                data-pinned={pinned ? "true" : "false"}
                                {...panelHandlers}
                            >
                                {pinned && (
                                    <button
                                        type="button"
                                        aria-label="Fechar detalhes da memória"
                                        className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        onClick={() => setOpen(false)}
                                    >
                                        <X className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                )}
                                {content()}
                            </motion.div>
                        </PopoverPrimitive.Content>
                    </PopoverPrimitive.Portal>
                )}
            </AnimatePresence>
        </PopoverPrimitive.Root>
    )
}
