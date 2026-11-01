"use client"

import { useEffect, type KeyboardEvent } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { NavGroupDef } from "../../types"
import { useHoverPopover } from "../../hooks/useHoverPopover"
import { SidebarItemSurface } from "./SidebarItemSurface"
import { SIDEBAR_FOCUS_RING } from "./sidebar-styles"

interface SidebarNavGroupProps {
    group: NavGroupDef
    /** `href` do item ativo do menu inteiro (o gatilho fica ativo quando é um dos itens do grupo). */
    activeHref: string | null
    collapsed: boolean
    reduceMotion: boolean
    onNavigate?: () => void
}

/** Distância do painel até o gatilho e margem mínima até a borda da janela (px). */
export const NAV_GROUP_PANEL_OFFSET = 12
export const NAV_GROUP_PANEL_COLLISION_PADDING = 12

/** Setas ↑/↓ (e Home/End) percorrem os links do painel. */
function moveFocus(event: KeyboardEvent<HTMLElement>) {
    const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>("a[href]"))
    if (!links.length) return
    const index = links.indexOf(document.activeElement as HTMLAnchorElement)
    const target = { ArrowDown: links[(index + 1) % links.length], ArrowUp: links[(index - 1 + links.length) % links.length], Home: links[0], End: links[links.length - 1] }[event.key]
    if (!target) return
    event.preventDefault()
    target.focus()
}

/**
 * Grupo do menu (Agentes, Contábil, Configurações): um item na barra que abre um painel **à direita**,
 * fora da barra (portal, ancorado ao próprio gatilho e limitado à janela), com os itens do grupo.
 * Abre ao passar o mouse (`useHoverPopover`) e também por clique, toque e teclado (Enter/Espaço
 * focam o primeiro link; setas percorrem; Esc fecha e devolve o foco ao gatilho).
 */
export function SidebarNavGroup({ group, activeHref, collapsed, reduceMotion, onNavigate }: SidebarNavGroupProps) {
    const pathname = usePathname()
    const { open, setOpen, toggle, triggerHandlers, panelHandlers, openedByHover } = useHoverPopover()
    const Icon = group.icon
    const active = group.items.some((item) => item.href === activeHref)

    useEffect(() => {
        setOpen(false)
    }, [pathname, setOpen])

    return (
        <li data-testid={`sidebar-group-${group.id}`}>
            <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
                <PopoverPrimitive.Trigger asChild>
                    <button
                        type="button"
                        aria-label={collapsed ? group.label : undefined}
                        className={cn("block w-full rounded-[4px]", SIDEBAR_FOCUS_RING)}
                        onClick={(event) => {
                            event.preventDefault()
                            toggle()
                        }}
                        {...triggerHandlers}
                    >
                        <SidebarItemSurface active={active || open} activeBar={active} collapsed={collapsed} reduceMotion={reduceMotion}>
                            <Icon className="h-5 w-5 shrink-0" aria-hidden />
                            {!collapsed && (
                                <>
                                    <span className="min-w-0 flex-1 truncate text-left">{group.label}</span>
                                    <ChevronRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                                </>
                            )}
                        </SidebarItemSurface>
                    </button>
                </PopoverPrimitive.Trigger>
                <AnimatePresence>
                    {open && (
                        <PopoverPrimitive.Portal forceMount>
                            <PopoverPrimitive.Content
                                forceMount
                                asChild
                                side="right"
                                align="start"
                                sideOffset={NAV_GROUP_PANEL_OFFSET}
                                collisionPadding={NAV_GROUP_PANEL_COLLISION_PADDING}
                                aria-label={group.label}
                                onOpenAutoFocus={(event) => {
                                    // O Radix pula links no foco inicial: por clique/teclado, o foco vai ao primeiro item.
                                    event.preventDefault()
                                    if (!openedByHover.current) (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>("a[href]")?.focus()
                                }}
                                onCloseAutoFocus={(event) => {
                                    if (openedByHover.current) event.preventDefault()
                                }}
                                // Esc fecha só o painel, não a gaveta do celular (que também escuta Esc).
                                onEscapeKeyDown={(event) => event.stopPropagation()}
                            >
                                <motion.div
                                    initial={{ opacity: 0, x: -8, scale: 0.96 }}
                                    animate={{ opacity: 1, x: 0, scale: 1 }}
                                    exit={{ opacity: 0, x: -6, scale: 0.97, transition: { duration: reduceMotion ? 0 : 0.15 } }}
                                    transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
                                    style={{ transformOrigin: "var(--radix-popover-content-transform-origin)" }}
                                    className="z-50 w-56 rounded-lg border border-sidebar-border bg-popover p-1.5 text-popover-foreground shadow-2xl shadow-primary/10"
                                    onKeyDown={moveFocus}
                                    data-testid={`sidebar-group-panel-${group.id}`}
                                    {...panelHandlers}
                                >
                                    <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{group.label}</p>
                                    <ul className="space-y-0.5">
                                        {group.items.map((item) => {
                                            const ItemIcon = item.icon
                                            const current = item.href === activeHref
                                            return (
                                                <li key={item.href}>
                                                    <Link
                                                        href={item.href}
                                                        aria-current={current ? "page" : undefined}
                                                        onClick={() => {
                                                            setOpen(false)
                                                            onNavigate?.()
                                                        }}
                                                        className={cn(
                                                            "flex items-center gap-2.5 rounded-[4px] px-2.5 py-2 text-sm transition-colors",
                                                            current ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "text-popover-foreground/80 hover:bg-sidebar-accent/60 hover:text-popover-foreground",
                                                            SIDEBAR_FOCUS_RING,
                                                        )}
                                                    >
                                                        <ItemIcon className="h-4 w-4 shrink-0" aria-hidden />
                                                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                                    </Link>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                </motion.div>
                            </PopoverPrimitive.Content>
                        </PopoverPrimitive.Portal>
                    )}
                </AnimatePresence>
            </PopoverPrimitive.Root>
        </li>
    )
}
