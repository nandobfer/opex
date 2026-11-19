"use client"

import type { ReactNode, RefObject } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"

interface DebugLogsPanelProps {
    visible: boolean
    debugHeight?: number | null
    logsCardRef?: RefObject<HTMLDivElement | null>
    /** `id` do painel, alvo do `aria-controls` do botão do título. */
    panelId: string
    testId?: string
    /** O terminal (`IntegrationDebugConsole`, `PluginDebugConsole`). */
    children: ReactNode
}

/**
 * Coluna lateral de logs (integrações e plugins), aberta pelo botão de debug do título, fixa na área
 * visível. O `aside` fica na grade como placeholder; maximizar redimensiona só o Card.
 */
export function DebugLogsPanel({ visible, debugHeight, logsCardRef, panelId, testId, children }: DebugLogsPanelProps) {
    return (
        <AnimatePresence>
            {visible && (
                <motion.aside
                    key="debug"
                    id={panelId}
                    initial={{ opacity: 0, x: 32 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 32 }}
                    transition={{ type: "spring", stiffness: 260, damping: 28 }}
                    className="sticky top-0 min-w-0"
                    style={{ height: debugHeight ? Math.max(debugHeight, 360) : undefined }}
                    data-testid={testId}
                >
                    <Card ref={logsCardRef} className="flex h-full min-h-[360px] flex-col">
                        <CardContent className="flex min-h-0 flex-1 flex-col pt-6">{children}</CardContent>
                    </Card>
                </motion.aside>
            )}
        </AnimatePresence>
    )
}
