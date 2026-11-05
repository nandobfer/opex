"use client"

import { useEffect, useId, useRef, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { cn } from "@/lib/utils"
import type { NavItemDef } from "../../types"
import { useHoverPopover } from "@/hooks/useHoverPopover"
import { SidebarItemSurface } from "./SidebarItemSurface"
import { SidebarHoverPanel } from "./SidebarHoverPanel"
import { SIDEBAR_FOCUS_RING } from "./sidebar-styles"

export interface SidebarHoverPanelContext {
    /** Fecha o painel (ex.: antes de abrir um diálogo a partir dele). */
    close: () => void
}

interface SidebarHoverNavItemProps {
    item: NavItemDef
    active: boolean
    reduceMotion: boolean
    onNavigate?: () => void
    /** Conteúdo do painel (montado só com o painel aberto). */
    panel: (context: SidebarHoverPanelContext) => ReactNode
    /** Largura do painel (classe Tailwind). */
    panelWidthClassName?: string
    /** Renderizado fora do painel e sempre montado (ex.: diálogos abertos a partir do painel). */
    children?: ReactNode
}

/**
 * Item do menu (barra recolhida) que **navega no clique** e abre um painel à direita ao passar o mouse
 * (`useHoverPopover`, mesmo comportamento dos grupos). O link é a âncora do Popover, não o gatilho:
 * o clique segue o link em vez de alternar o painel. Pelo teclado, Enter navega, a seta → abre o
 * painel com o foco no primeiro link e Esc fecha devolvendo o foco ao item. Toque não abre o painel.
 */
export function SidebarHoverNavItem({ item, active, reduceMotion, onNavigate, panel, panelWidthClassName, children }: SidebarHoverNavItemProps) {
    const pathname = usePathname()
    const { open, setOpen, openFromKeyboard, triggerHandlers, panelHandlers, openedByHover } = useHoverPopover()
    const linkRef = useRef<HTMLAnchorElement>(null)
    const panelId = useId()
    const Icon = item.icon

    useEffect(() => {
        setOpen(false)
    }, [pathname, setOpen])

    return (
        <li data-testid={`sidebar-panel-item-${item.panel ?? item.href}`}>
            <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
                <PopoverPrimitive.Anchor asChild>
                    <Link
                        ref={linkRef}
                        href={item.href}
                        aria-label={item.label}
                        aria-current={active ? "page" : undefined}
                        aria-haspopup="true"
                        aria-expanded={open}
                        aria-controls={open ? panelId : undefined}
                        className={cn("block rounded-[4px]", SIDEBAR_FOCUS_RING)}
                        onClick={() => {
                            setOpen(false)
                            onNavigate?.()
                        }}
                        onKeyDown={(event) => {
                            if (event.key !== "ArrowRight") return
                            event.preventDefault()
                            if (openFromKeyboard()) document.getElementById(panelId)?.querySelector<HTMLElement>("a[href]")?.focus()
                        }}
                        {...triggerHandlers}
                    >
                        <SidebarItemSurface active={active || open} activeBar={active} collapsed reduceMotion={reduceMotion}>
                            <Icon className="h-5 w-5 shrink-0" aria-hidden />
                        </SidebarItemSurface>
                    </Link>
                </PopoverPrimitive.Anchor>
                <SidebarHoverPanel
                    open={open}
                    label={item.label}
                    collapsed
                    reduceMotion={reduceMotion}
                    openedByHover={openedByHover}
                    panelHandlers={panelHandlers}
                    widthClassName={panelWidthClassName}
                    testId={`sidebar-item-panel-${item.panel ?? item.href}`}
                    id={panelId}
                    returnFocusRef={linkRef}
                >
                    {panel({ close: () => setOpen(false) })}
                </SidebarHoverPanel>
            </PopoverPrimitive.Root>
            {children}
        </li>
    )
}
