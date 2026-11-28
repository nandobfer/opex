"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AlertCircle, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export interface FormSectionNavItem {
    id: string
    label: string
    icon: LucideIcon
    /** A seção tem alterações não salvas. */
    dirty?: boolean
    /** A seção tem erro de validação. */
    error?: boolean
}

/** Seção visível (a primeira que cruza o terço de cima da tela), por `IntersectionObserver`. */
function useActiveSection(ids: string[]): [string | null, (id: string) => void] {
    const [active, setActive] = useState<string | null>(ids[0] ?? null)
    const key = ids.join("|")
    useEffect(() => {
        if (typeof IntersectionObserver === "undefined") return
        const visible = new Set<string>()
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) visible.add(entry.target.id)
                    else visible.delete(entry.target.id)
                }
                const first = key.split("|").find((id) => visible.has(id))
                if (first) setActive(first)
            },
            { rootMargin: "0px 0px -66% 0px" },
        )
        for (const id of key.split("|")) {
            const element = document.getElementById(id)
            if (element) observer.observe(element)
        }
        return () => observer.disconnect()
    }, [key])
    return [active, setActive]
}

/** Rola até a seção (sem animação com movimento reduzido) e põe o foco no primeiro campo com erro, se houver. */
export function scrollToSection(id: string, options: { smooth: boolean; focusInvalid?: boolean }) {
    const element = document.getElementById(id)
    if (!element) return
    element.scrollIntoView?.({ behavior: options.smooth ? "smooth" : "auto", block: "start" })
    if (options.focusInvalid) element.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]')?.focus({ preventScroll: true })
}

/**
 * Índice das seções de uma página de formulário: marca a seção visível, as com alteração (ponto) e as
 * com erro (alerta). No desktop fica preso à lateral; abaixo de `lg`, faixa horizontal no topo.
 */
export function FormSectionNav({ items, label }: { items: readonly FormSectionNavItem[]; label: string }) {
    const reduced = useReducedMotion()
    const [active, setActive] = useActiveSection(items.map((item) => item.id))
    const go = (id: string) => {
        setActive(id)
        scrollToSection(id, { smooth: !reduced })
    }
    return (
        <nav aria-label={label} className="lg:sticky lg:top-6 lg:self-start">
            <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
                {items.map(({ id, label: itemLabel, icon: Icon, dirty, error }) => {
                    const current = active === id
                    return (
                        <li key={id} className="shrink-0">
                            <a
                                href={`#${id}`}
                                aria-current={current ? "location" : undefined}
                                data-section-link={id}
                                onClick={(event) => {
                                    event.preventDefault()
                                    go(id)
                                }}
                                className={cn(
                                    "relative flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    current && "text-foreground",
                                    error && "text-destructive hover:text-destructive",
                                )}
                            >
                                {current && <motion.span layoutId={`${label}-active`} className="absolute inset-0 rounded-lg bg-muted" transition={{ duration: reduced ? 0 : 0.2 }} aria-hidden />}
                                <Icon className="relative h-4 w-4 shrink-0" aria-hidden />
                                <span className="relative flex-1">{itemLabel}</span>
                                <AnimatePresence initial={false}>
                                    {error ? (
                                        <motion.span key="error" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} className="relative" aria-label="com erro">
                                            <AlertCircle className="h-4 w-4" aria-hidden />
                                        </motion.span>
                                    ) : dirty ? (
                                        <motion.span key="dirty" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} className="relative h-2 w-2 rounded-full bg-primary" aria-label="alterada" />
                                    ) : null}
                                </AnimatePresence>
                            </a>
                        </li>
                    )
                })}
            </ul>
        </nav>
    )
}
