"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Radar, TimerOff } from "lucide-react"

export interface PrWatchCountdownProps {
    /** Rotina ligada em Integrações › Crons. */
    enabled: boolean
    nextCheckAt: string | null
    /** Uma verificação está em andamento agora. */
    checking: boolean
}

/** `m:ss` do tempo restante (nunca negativo). */
export function formatRemaining(ms: number): string {
    const seconds = Math.max(0, Math.ceil(ms / 1000))
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

/** Rodapé da saída da mesa em PR aberto: quando o acompanhamento do PR verifica de novo. */
export function PrWatchCountdown({ enabled, nextCheckAt, checking }: PrWatchCountdownProps) {
    const reduceMotion = useReducedMotion()
    const [now, setNow] = useState(() => Date.now())
    const ticking = enabled && !checking && Boolean(nextCheckAt)

    useEffect(() => {
        if (!ticking) return
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [ticking])

    if (!enabled) {
        return (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <TimerOff className="h-3.5 w-3.5" aria-hidden /> Acompanhamento automático do PR desligado (Integrações › Crons)
            </p>
        )
    }
    if (!checking && !nextCheckAt) return null
    const remaining = nextCheckAt ? Date.parse(nextCheckAt) - now : 0
    const label = checking ? "Verificando o PR agora…" : remaining > 0 ? null : "Verificação em instantes…"

    return (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="off">
            <Radar className="h-3.5 w-3.5 text-primary" aria-hidden />
            {label ?? (
                <span>
                    Próxima verificação em{" "}
                    <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span key={formatRemaining(remaining)} initial={reduceMotion ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }} transition={{ duration: 0.15 }} className="inline-block font-mono tabular-nums text-foreground">
                            {formatRemaining(remaining)}
                        </motion.span>
                    </AnimatePresence>
                </span>
            )}
        </p>
    )
}
