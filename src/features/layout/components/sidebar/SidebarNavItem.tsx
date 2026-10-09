"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { badgeLabel } from "../../navigation"
import type { NavItemDef } from "../../types"
import { SidebarBadge } from "./SidebarBadge"
import { SidebarTooltip } from "./SidebarTooltip"
import { SIDEBAR_FOCUS_RING, sidebarItemVariants } from "./sidebar-styles"

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
 * Item do menu: movimento do Smart Desk (entra da esquerda, desliza 4px no hover, "afunda" no
 * clique, barra branca animada no ativo) + anatomia do DS Sipal (ícone 20px, rótulo 14px,
 * `aria-current`, contador com texto para leitor de tela, foco visível, dica quando recolhido).
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
                    <motion.div
                        variants={sidebarItemVariants}
                        initial="hidden"
                        animate="show"
                        whileHover={{ x: 4 }}
                        whileTap={{ scale: 0.98 }}
                        className={cn(
                            "relative flex w-full items-center gap-3 rounded-[4px] px-3 py-2 text-sm transition-colors",
                            active
                                ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                            collapsed && "justify-center px-0 py-2.5",
                        )}
                    >
                        {active && (
                            <motion.span
                                layoutId={reduceMotion ? undefined : "sidebar-active-bar"}
                                className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r bg-primary shadow-[0_0_10px_hsl(var(--primary))]"
                            />
                        )}
                        <Icon className="h-5 w-5 shrink-0" aria-hidden />
                        {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                        {item.badge && <SidebarBadge count={badgeCount} label={badgeLabel(item.badge, badgeCount)} collapsed={collapsed} />}
                    </motion.div>
                </Link>
            </SidebarTooltip>
        </li>
    )
}
