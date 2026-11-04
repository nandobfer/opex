"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export interface WorkbenchTab<T extends string> {
    id: T
    label: string
    disabled?: boolean
    hidden?: boolean
}

interface WorkbenchTabsProps<T extends string> {
    tabs: readonly WorkbenchTab<T>[]
    value: T
    onChange: (value: T) => void
    /** Nome acessível da faixa. */
    label: string
    /** `layoutId` do sublinhado animado (único por faixa visível ao mesmo tempo). */
    indicatorId: string
    className?: string
}

/**
 * Faixa de abas da mesa de trabalho (sublinhado primário animado): usada na mesa em andamento, na mesa
 * no refinamento e no bloco da tarefa da tela inicial (OPE-137).
 */
export function WorkbenchTabs<T extends string>({ tabs, value, onChange, label, indicatorId, className }: WorkbenchTabsProps<T>) {
    return (
        <div role="tablist" aria-label={label} className={cn("flex gap-1 overflow-x-auto border-b px-4", className)}>
            {tabs
                .filter((tab) => !tab.hidden)
                .map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={value === tab.id}
                        disabled={tab.disabled}
                        onClick={() => onChange(tab.id)}
                        className={cn("relative shrink-0 whitespace-nowrap px-3 pb-2 pt-1 text-sm transition-colors disabled:opacity-40", value === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                    >
                        {tab.label}
                        {value === tab.id && <motion.span layoutId={indicatorId} className="absolute inset-x-0 bottom-0 h-0.5 rounded bg-primary" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                    </button>
                ))}
        </div>
    )
}
