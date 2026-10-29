"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AlertTriangle, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { hasMultipleAccounts, summaryWindows } from "../logic"
import type { QuotaProviderDto } from "../types"
import { QuotaWindowBar } from "./QuotaWindowBar"

interface QuotaProviderGroupProps {
    provider: QuotaProviderDto
    now: number
    expanded: boolean
    onToggle: () => void
}

/**
 * Um provedor recolhível: expandido, todas as janelas que o plugin informou e os erros (parcial/falha,
 * discretos); recolhido, só a primeira janela de cada conta (`summaryWindows`).
 */
export function QuotaProviderGroup({ provider, now, expanded, onToggle }: QuotaProviderGroupProps) {
    const reduceMotion = useReducedMotion()
    const bodyId = `quota-provider-${provider.id}-body`
    const windows = expanded ? provider.windows : summaryWindows(provider)
    const showAccount = !expanded && hasMultipleAccounts(provider)
    return (
        <motion.section
            aria-label={`Quota ${provider.name}`}
            data-quota-provider={provider.id}
            data-expanded={expanded}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="space-y-1.5"
        >
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                aria-controls={bodyId}
                aria-label={`${expanded ? "Recolher" : "Expandir"} ${provider.name}`}
                className="flex w-full items-center gap-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <h3 className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-foreground/80">{provider.name}</h3>
                <motion.span animate={{ rotate: expanded ? 0 : -90 }} transition={{ duration: reduceMotion ? 0 : 0.2 }} className="flex text-muted-foreground" aria-hidden>
                    <ChevronDown className="h-3 w-3" />
                </motion.span>
            </button>
            <AnimatePresence initial={false} mode="wait">
                <motion.div
                    id={bodyId}
                    key={expanded ? "full" : "summary"}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
                    className="space-y-1.5 overflow-hidden"
                >
                    {windows.map((window) => (
                        <QuotaWindowBar key={window.id} providerName={provider.name} window={window} now={now} label={showAccount && window.account ? `${window.account} · ${window.label}` : undefined} />
                    ))}
                    {expanded &&
                        provider.errors.map((error) => (
                            <p key={error} className={cn("flex items-center gap-1 text-[10px]", provider.status === "error" ? "text-destructive" : "text-warning")}>
                                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                                <span className="truncate" title={error}>
                                    {error}
                                </span>
                            </p>
                        ))}
                </motion.div>
            </AnimatePresence>
        </motion.section>
    )
}
