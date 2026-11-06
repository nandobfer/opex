"use client"

import type { KeyboardEvent, MutableRefObject, PointerEvent, ReactNode, RefObject } from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@/lib/utils"

/** Distância do painel até o gatilho (barra recolhida e gaveta) e margem mínima até a borda da janela (px). */
export const NAV_GROUP_PANEL_OFFSET = 12
export const NAV_GROUP_PANEL_DRAWER_OFFSET = 4
export const NAV_GROUP_PANEL_COLLISION_PADDING = 12

/** Itens percorridos pelas setas e focados ao abrir por clique/teclado (padrão: os links do painel). */
export const SIDEBAR_PANEL_FOCUS_SELECTOR = "a[href]"

/** Setas ↑/↓ (e Home/End) percorrem os itens focáveis do painel (`selector`). */
function moveFocus(event: KeyboardEvent<HTMLElement>, selector: string) {
    const links = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(selector))
    if (!links.length) return
    const index = links.indexOf(document.activeElement as HTMLElement)
    const target = { ArrowDown: links[(index + 1) % links.length], ArrowUp: links[(index - 1 + links.length) % links.length], Home: links[0], End: links[links.length - 1] }[event.key]
    if (!target) return
    event.preventDefault()
    target.focus()
}

interface PanelHandlers {
    onPointerEnter: (event: PointerEvent) => void
    onPointerLeave: (event: PointerEvent) => void
}

interface SidebarHoverPanelProps {
    open: boolean
    /** Título do painel (caixa-alta) e nome acessível. */
    label: string
    /** Barra recolhida: à direita, fora da barra. Gaveta (expandida): abaixo do gatilho. */
    collapsed: boolean
    reduceMotion: boolean
    /** Última abertura pelo cursor: o painel não rouba o foco nem o devolve ao fechar. */
    openedByHover: MutableRefObject<boolean>
    panelHandlers: PanelHandlers
    /** Largura do painel (classe Tailwind). */
    widthClassName?: string
    testId: string
    /** `id` do painel (para `aria-controls` no gatilho). */
    id?: string
    /**
     * Para onde o foco volta ao fechar (aberto por teclado). Necessário quando o gatilho é um
     * `Popover.Anchor`: sem `Popover.Trigger`, o Radix não sabe para onde devolver o foco.
     */
    returnFocusRef?: RefObject<HTMLElement | null>
    /** Itens focáveis (setas e foco inicial); padrão: links. Painéis com botões passam `"button, a[href]"`. */
    focusSelector?: string
    children: ReactNode
}

/**
 * Moldura dos painéis do menu (grupos e submenus de item): portal do Radix Popover ancorado ao
 * gatilho e limitado à janela, animado com Framer Motion, com título em caixa-alta e navegação por
 * setas entre os links. Deve ficar dentro do `Popover.Root` do gatilho.
 */
export function SidebarHoverPanel({ open, label, collapsed, reduceMotion, openedByHover, panelHandlers, widthClassName = "w-56", testId, id, returnFocusRef, focusSelector = SIDEBAR_PANEL_FOCUS_SELECTOR, children }: SidebarHoverPanelProps) {
    return (
        <AnimatePresence>
            {open && (
                <PopoverPrimitive.Portal forceMount>
                    <PopoverPrimitive.Content
                        forceMount
                        asChild
                        side={collapsed ? "right" : "bottom"}
                        align="start"
                        sideOffset={collapsed ? NAV_GROUP_PANEL_OFFSET : NAV_GROUP_PANEL_DRAWER_OFFSET}
                        collisionPadding={NAV_GROUP_PANEL_COLLISION_PADDING}
                        aria-label={label}
                        onOpenAutoFocus={(event) => {
                            // O Radix pula links no foco inicial: por clique/teclado, o foco vai ao primeiro item.
                            event.preventDefault()
                            if (!openedByHover.current) (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(focusSelector)?.focus()
                        }}
                        onCloseAutoFocus={(event) => {
                            if (openedByHover.current) {
                                event.preventDefault()
                                return
                            }
                            if (returnFocusRef) {
                                event.preventDefault()
                                returnFocusRef.current?.focus()
                            }
                        }}
                        // Esc fecha só o painel, não a gaveta do celular (que também escuta Esc).
                        onEscapeKeyDown={(event) => event.stopPropagation()}
                    >
                        <motion.div
                            initial={collapsed ? { opacity: 0, x: -8, scale: 0.96 } : { opacity: 0, y: -6, scale: 0.97 }}
                            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                            exit={{ opacity: 0, ...(collapsed ? { x: -6 } : { y: -4 }), scale: 0.97, transition: { duration: reduceMotion ? 0 : 0.15 } }}
                            transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
                            style={{ transformOrigin: "var(--radix-popover-content-transform-origin)" }}
                            className={cn(
                                "z-50 max-w-[var(--radix-popover-content-available-width)] rounded-lg border border-sidebar-border bg-popover p-1.5 text-popover-foreground shadow-2xl shadow-primary/10",
                                widthClassName,
                            )}
                            onKeyDown={(event) => moveFocus(event, focusSelector)}
                            data-testid={testId}
                            id={id}
                            {...panelHandlers}
                        >
                            <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{label}</p>
                            {children}
                        </motion.div>
                    </PopoverPrimitive.Content>
                </PopoverPrimitive.Portal>
            )}
        </AnimatePresence>
    )
}
