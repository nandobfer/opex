"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { hasMultipleAccounts, summaryLabel, summaryWindows } from "../logic"
import type { QuotaProviderDto } from "../types"
import { QuotaWindowBar } from "./QuotaWindowBar"

interface QuotaCompactListProps {
    providers: readonly QuotaProviderDto[]
    collapsedProviders: readonly string[]
    now: number
}

/**
 * Card recolhido: uma barra por conta dos provedores expandidos, com a primeira janela (quase sempre
 * a de 5h), rotulada "Provedor · janela". Provedores recolhidos ficam ocultos.
 */
export function QuotaCompactList({ providers, collapsedProviders, now }: QuotaCompactListProps) {
    const reduceMotion = useReducedMotion()
    const visible = providers.filter((provider) => !collapsedProviders.includes(provider.id))
    return (
        <div className="space-y-1.5" data-testid="quota-compact">
            <AnimatePresence initial={false}>
                {visible.map((provider) => {
                    const multiAccount = hasMultipleAccounts(provider)
                    return (
                        <motion.div
                            key={provider.id}
                            data-quota-provider={provider.id}
                            initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="space-y-1.5"
                        >
                            {summaryWindows(provider).map((window) => (
                                <QuotaWindowBar key={window.id} providerName={provider.name} window={window} now={now} label={summaryLabel(provider, window, multiAccount)} />
                            ))}
                        </motion.div>
                    )
                })}
            </AnimatePresence>
        </div>
    )
}
