"use client"

import { useId, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { SIDEBAR_FOCUS_RING } from "./sidebar-styles"

interface SidebarNavSectionProps {
    label?: string
    open: boolean
    collapsed: boolean
    reduceMotion: boolean
    onToggle: () => void
    children: ReactNode
}

/**
 * Seção do menu (padrão SideNavigation do DS Sipal): título em caixa-alta que abre e fecha
 * (`aria-expanded`), com a lista animada em altura/opacidade. Sem título, os itens ficam soltos.
 * Com o menu recolhido, o título vira um divisor fino e os itens ficam sempre visíveis.
 */
export function SidebarNavSection({ label, open, collapsed, reduceMotion, onToggle, children }: SidebarNavSectionProps) {
    const listId = useId()
    const list = <ul className="space-y-1">{children}</ul>

    if (!label) return <div>{list}</div>
    if (collapsed) {
        return (
            <div role="group" aria-label={label}>
                <div className="mx-3 mb-2 mt-1 h-px bg-sidebar-border" aria-hidden />
                {list}
            </div>
        )
    }

    return (
        <div>
            <h2>
                <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={open}
                    aria-controls={listId}
                    className={cn(
                        "flex w-full items-center justify-between rounded-[4px] px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground",
                        SIDEBAR_FOCUS_RING,
                    )}
                >
                    {label}
                    <motion.span
                        animate={{ rotate: open ? 0 : -90 }}
                        transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
                        className="flex"
                        aria-hidden
                    >
                        <ChevronDown className="h-4 w-4" />
                    </motion.span>
                </button>
            </h2>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        id={listId}
                        key="list"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                    >
                        {list}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
