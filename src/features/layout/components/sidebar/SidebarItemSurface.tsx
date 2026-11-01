"use client"

import type { CSSProperties, ReactNode } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { sidebarItemVariants } from "./sidebar-styles"

interface SidebarItemSurfaceProps {
    /** Item ativo (fundo de destaque e texto forte). */
    active: boolean
    collapsed: boolean
    reduceMotion: boolean
    /** Barra primária à esquerda no item ativo (`layoutId` compartilhado entre os itens do menu). */
    activeBar?: boolean
    className?: string
    style?: CSSProperties
    children: ReactNode
}

/**
 * Superfície visual de um item do menu (link, grupo ou agente de chat): entra da esquerda, desliza
 * 4px no hover, "afunda" no clique e, no ativo, ganha o fundo de destaque e a barra primária animada.
 */
export function SidebarItemSurface({ active, collapsed, reduceMotion, activeBar = true, className, style, children }: SidebarItemSurfaceProps) {
    return (
        <motion.div
            variants={sidebarItemVariants}
            initial="hidden"
            animate="show"
            whileHover={{ x: 4 }}
            whileTap={{ scale: 0.98 }}
            style={style}
            className={cn(
                "relative flex w-full items-center gap-3 rounded-[4px] px-3 py-2 text-sm transition-colors",
                active ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                collapsed && "justify-center px-0 py-2.5",
                className,
            )}
        >
            {active && activeBar && (
                <motion.span
                    layoutId={reduceMotion ? undefined : "sidebar-active-bar"}
                    className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r bg-primary shadow-[0_0_10px_hsl(var(--primary))]"
                    data-testid="sidebar-active-bar"
                />
            )}
            {children}
        </motion.div>
    )
}
