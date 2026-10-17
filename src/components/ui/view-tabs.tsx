"use client"

import { useId, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

export interface ViewTabDef<T extends string> {
    id: T
    label: ReactNode
    disabled?: boolean
    /** Aba sem conteúdo agora (ex.: sem forks): não entra na faixa. */
    hidden?: boolean
}

interface ViewTabsProps<T extends string> {
    tabs: readonly ViewTabDef<T>[]
    active: T
    onChange: (id: T) => void
    label: string
    className?: string
    children: ReactNode
}

/**
 * Faixa de abas do painel (um item por aba, sublinhado que desliza) e o painel animado. Devolve um
 * fragmento de propósito: a faixa e o painel são irmãos dentro da coluna de quem usa (`flex
 * flex-col`), então a casca do painel (cabeçalho, ações fixas) permanece no layout.
 */
export function ViewTabs<T extends string>({ tabs, active, onChange, label, className, children }: ViewTabsProps<T>) {
    const underlineId = useId()
    const reduceMotion = useReducedMotion()
    return (
        <>
            <div role="tablist" aria-label={label} className={cn("flex gap-1 border-b px-4", className)}>
                {tabs
                    .filter((tab) => !tab.hidden)
                    .map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={active === tab.id}
                            disabled={tab.disabled}
                            onClick={() => onChange(tab.id)}
                            className={cn(
                                "relative px-3 pb-2 pt-1 text-sm transition-colors disabled:opacity-40",
                                active === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {tab.label}
                            {active === tab.id && (
                                <motion.span
                                    layoutId={underlineId}
                                    className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-primary"
                                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                                />
                            )}
                        </button>
                    ))}
            </div>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={active}
                    role="tabpanel"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.15 }}
                    className="flex min-h-0 min-w-0 flex-1 flex-col"
                >
                    {children}
                </motion.div>
            </AnimatePresence>
        </>
    )
}
