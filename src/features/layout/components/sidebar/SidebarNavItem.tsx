"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { badgeLabel } from "../../navigation"
import type { NavItemDef } from "../../types"
import { SidebarBadge } from "./SidebarBadge"
import { SidebarItemSurface } from "./SidebarItemSurface"
import { SidebarTooltip } from "./SidebarTooltip"
import { SIDEBAR_FOCUS_RING } from "./sidebar-styles"

interface SidebarNavItemProps {
    item: NavItemDef
    href: string
    active: boolean
    collapsed: boolean
    badgeCount: number
    reduceMotion: boolean
    onNavigate?: () => void
}

/**
 * Item do menu: movimento do Smart Desk (`SidebarItemSurface`) + anatomia do DS Sipal (ícone 20px,
 * rótulo 14px, `aria-current`, contador com texto para leitor de tela, foco visível, dica quando
 * recolhido).
 */
export function SidebarNavItem({ item, href, active, collapsed, badgeCount, reduceMotion, onNavigate }: SidebarNavItemProps) {
    const Icon = item.icon
    return (
        <li>
            <SidebarTooltip label={item.label} enabled={collapsed}>
                <Link
                    href={href}
                    onClick={onNavigate}
                    aria-label={collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn("block rounded-[4px]", SIDEBAR_FOCUS_RING)}
                >
                    <SidebarItemSurface active={active} collapsed={collapsed} reduceMotion={reduceMotion}>
                        <Icon className="h-5 w-5 shrink-0" aria-hidden />
                        {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                        {item.badge && <SidebarBadge count={badgeCount} label={badgeLabel(item.badge, badgeCount)} collapsed={collapsed} />}
                    </SidebarItemSurface>
                </Link>
            </SidebarTooltip>
        </li>
    )
}
