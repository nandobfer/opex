"use client"

import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, Brain, Check, Loader2, Wrench, X } from "lucide-react"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { formatNumberBR } from "@/lib/format"
import type { UnderstandState } from "../../understand-stream"

const itemMotion = { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.18 } }

/** Atividade antes/durante o texto: preparo, raciocínio, ferramentas do agente, avisos e erro. */
export function UnderstandActivity({ state }: { state: UnderstandState }) {
    const waiting = state.status === "running" && !state.text && !state.reasoning
    return (
        <div className="space-y-2 empty:hidden [&:not(:empty)]:mb-4">
            <AnimatePresence initial={false}>
                {waiting && (
                    <motion.p key="waiting" {...itemMotion} className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {state.model ? "Aguardando a resposta do modelo…" : "Lendo a tarefa…"}
                    </motion.p>
                )}
                {state.reasoning && (
                    <motion.p key="reasoning" {...itemMotion} className="flex items-center gap-2 text-muted-foreground">
                        <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} className="inline-flex">
                            <Brain className="h-4 w-4" aria-hidden />
                        </motion.span>
                        Pensando…
                    </motion.p>
                )}
                {state.tools.map((tool) => (
                    <motion.p key={tool.id} {...itemMotion} className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                        {tool.state === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : tool.state === "done" ? <Check className="h-3.5 w-3.5 text-primary" aria-hidden /> : <X className="h-3.5 w-3.5 text-destructive" aria-hidden />}
                        <Wrench className="h-3 w-3" aria-hidden /> {tool.name}
                    </motion.p>
                ))}
                {state.notices.map((notice, index) => (
                    <motion.p key={`notice-${index}`} {...itemMotion} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {notice}
                    </motion.p>
                ))}
                {state.status === "error" && state.error && (
                    <motion.div key="error" {...itemMotion} role="alert" className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <span>{state.error}</span>
                    </motion.div>
                )}
                {state.status === "cancelled" && (
                    <motion.p key="cancelled" {...itemMotion} className="text-xs text-muted-foreground">
                        Geração interrompida.
                    </motion.p>
                )}
            </AnimatePresence>
        </div>
    )
}

/** Tokens, custo e duração da geração concluída. */
export function UnderstandUsage({ state }: { state: UnderstandState }) {
    const usage = state.usage
    return (
        <AnimatePresence initial={false}>
            {state.status === "done" && usage && (
                <motion.p key="usage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {usage.totalTokens !== null && (
                        <span>
                            <AnimatedNumber value={usage.totalTokens} formatter={(value) => formatNumberBR(value, 0)} /> tokens
                        </span>
                    )}
                    {usage.costUsd !== null && <span>US$ {usage.costUsd.toFixed(4)}</span>}
                    {state.durationMs !== null && <span>{formatNumberBR(state.durationMs / 1000, 1)} s</span>}
                </motion.p>
            )}
        </AnimatePresence>
    )
}
