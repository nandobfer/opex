"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { navGroupActive } from "../../navigation"
import type { NavGroupDef } from "../../types"
import { useHoverPopover } from "@/hooks/useHoverPopover"
import { SidebarItemSurface } from "./SidebarItemSurface"
import { SidebarHoverPanel } from "./SidebarHoverPanel"
import { SIDEBAR_FOCUS_RING, SIDEBAR_PANEL_LINK, SIDEBAR_PANEL_LINK_ACTIVE, SIDEBAR_PANEL_LINK_IDLE } from "./sidebar-styles"

export { NAV_GROUP_PANEL_COLLISION_PADDING, NAV_GROUP_PANEL_DRAWER_OFFSET, NAV_GROUP_PANEL_OFFSET } from "./SidebarHoverPanel"

interface SidebarNavGroupProps {
    group: NavGroupDef
    /** `href` do item ativo do menu inteiro (o gatilho fica ativo quando é um dos itens do grupo). */
    activeHref: string | null
    collapsed: boolean
    reduceMotion: boolean
    onNavigate?: () => void
}

/**
 * Grupo do menu (Agentes, Contábil, Configurações): um item na barra que abre um painel **à direita**,
 * fora da barra (portal, ancorado ao próprio gatilho e limitado à janela), com os itens do grupo. Na
 * gaveta do celular (expandida) o painel abre abaixo do gatilho, para caber em telas estreitas.
 * Abre ao passar o mouse (`useHoverPopover`) e também por clique, toque e teclado (Enter/Espaço
 * focam o primeiro link; setas percorrem; Esc fecha e devolve o foco ao gatilho).
 */
export function SidebarNavGroup({ group, activeHref, collapsed, reduceMotion, onNavigate }: SidebarNavGroupProps) {
    const pathname = usePathname()
    const { open, setOpen, toggle, triggerHandlers, panelHandlers, openedByHover } = useHoverPopover()
    const Icon = group.icon
    const active = navGroupActive(group, activeHref)

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
                <SidebarHoverPanel
                    open={open}
                    label={group.label}
                    collapsed={collapsed}
                    reduceMotion={reduceMotion}
                    openedByHover={openedByHover}
                    panelHandlers={panelHandlers}
                    testId={`sidebar-group-panel-${group.id}`}
                >
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
                                        className={cn(SIDEBAR_PANEL_LINK, current ? SIDEBAR_PANEL_LINK_ACTIVE : SIDEBAR_PANEL_LINK_IDLE, SIDEBAR_FOCUS_RING)}
                                    >
                                        <ItemIcon className="h-4 w-4 shrink-0" aria-hidden />
                                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                    </Link>
                                </li>
                            )
                        })}
                    </ul>
                </SidebarHoverPanel>
            </PopoverPrimitive.Root>
        </li>
    )
}
