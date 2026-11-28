"use client"

import { motion } from "framer-motion"
import { Hourglass, Loader2, WifiOff } from "lucide-react"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { backgroundLabel } from "@/features/agentic/background-label"
import { architectPhaseLabel } from "../../constants"
import type { ArchitectLiveProgress } from "../../types"

/** Faixa do diagrama ao vivo: fase, leituras e o tamanho do rascunho (números animados). */
export function ArchitectLiveBar({ progress, connected, provider = null }: { progress: ArchitectLiveProgress | null; connected: boolean; provider?: string | null }) {
    // Espera pelos subagentes/comandos em segundo plano do OpenCode (OPE-216) no lugar da fase.
    const waiting = backgroundLabel(progress?.background)
    const phase = waiting ?? architectPhaseLabel(progress?.phase ?? "starting", provider)
    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none absolute inset-x-0 bottom-3 z-10 mx-auto flex w-fit max-w-[calc(100%-1rem)] items-center gap-2 rounded-full border bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur"
            role="status"
            aria-live="polite"
            data-testid="architect-live-bar"
        >
            {!connected ? <WifiOff className="h-3.5 w-3.5 text-destructive" aria-hidden /> : waiting ? <Hourglass className="h-3.5 w-3.5 animate-pulse text-primary" aria-hidden /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />}
            <span className="truncate">{connected ? phase : "Reconectando ao diagrama ao vivo…"}</span>
            <span className="tabular-nums">
                · <AnimatedNumber value={progress?.nodes ?? 0} /> nós · <AnimatedNumber value={progress?.edges ?? 0} /> ligações
                {progress?.tools ? (
                    <>
                        {" "}
                        · <AnimatedNumber value={progress.tools} /> leituras
                    </>
                ) : null}
            </span>
        </motion.div>
    )
}
