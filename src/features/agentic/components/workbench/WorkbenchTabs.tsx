"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
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

/** Há conteúdo escondido antes/depois da faixa (com 1 px de folga para o arredondamento). */
export function scrollEdges(scrollLeft: number, clientWidth: number, scrollWidth: number): { start: boolean; end: boolean } {
    return { start: scrollLeft > 1, end: scrollLeft + clientWidth < scrollWidth - 1 }
}

/**
 * Faixa de abas da mesa de trabalho (sublinhado primário animado): usada na mesa em andamento, na mesa
 * no refinamento e no bloco da tarefa da tela inicial (OPE-137). Quando não cabe (celular, OPE-166), rola
 * na horizontal: a aba ativa entra na área visível sozinha e, abaixo de `lg`, um esmaecido na borda (no
 * lugar da barra de rolagem) avisa que há mais abas.
 */
export function WorkbenchTabs<T extends string>({ tabs, value, onChange, label, indicatorId, className }: WorkbenchTabsProps<T>) {
    const listRef = useRef<HTMLDivElement>(null)
    const reduceMotion = useReducedMotion()
    const [edges, setEdges] = useState({ start: false, end: false })
    const measure = useCallback(() => {
        const list = listRef.current
        if (!list) return
        const next = scrollEdges(list.scrollLeft, list.clientWidth, list.scrollWidth)
        setEdges((current) => (current.start === next.start && current.end === next.end ? current : next))
    }, [])
    useLayoutEffect(() => {
        measure()
        const list = listRef.current
        if (!list || typeof ResizeObserver === "undefined") return
        const observer = new ResizeObserver(measure)
        observer.observe(list)
        return () => observer.disconnect()
    }, [measure, tabs.length])
    // A aba ativa sempre à vista (ex.: "Adversário" ou "Aprendizado" no fim da faixa do celular).
    useEffect(() => {
        const active = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
        active?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: reduceMotion ? "auto" : "smooth" })
    }, [value, reduceMotion])

    return (
        <div className="relative border-b">
            <div ref={listRef} role="tablist" aria-label={label} onScroll={measure} className={cn("flex gap-1 overflow-x-auto px-4 max-lg:[scrollbar-width:none] max-lg:[&::-webkit-scrollbar]:hidden", className)}>
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
            <AnimatePresence initial={false}>
                {edges.start && <motion.span key="start" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent lg:hidden" aria-hidden data-testid="tabs-fade-start" />}
                {edges.end && <motion.span key="end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent lg:hidden" aria-hidden data-testid="tabs-fade-end" />}
            </AnimatePresence>
        </div>
    )
}
