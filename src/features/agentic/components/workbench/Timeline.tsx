"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Brain, Loader2, MessageSquareDashed } from "lucide-react"
import type { TimelineState } from "../../timeline"
import { TimelineItemView } from "./TimelineItemView"

const STICK_THRESHOLD = 80

/** Saída da IA ao vivo; acompanha o fim enquanto o usuário não rolar para cima. */
export function Timeline({ timeline, running }: { timeline: TimelineState; running: boolean }) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const stick = useRef(true)
    const last = timeline.items.at(-1)
    const lastSize = last?.kind === "text" ? last.text.length : last?.kind === "tool" ? (last.output?.length ?? 0) : 0

    useEffect(() => {
        const element = scrollRef.current
        if (!element) return
        const onScroll = () => {
            stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_THRESHOLD
        }
        element.addEventListener("scroll", onScroll, { passive: true })
        return () => element.removeEventListener("scroll", onScroll)
    }, [])

    useLayoutEffect(() => {
        const element = scrollRef.current
        if (element && stick.current) element.scrollTop = element.scrollHeight
    }, [timeline.items.length, lastSize, timeline.reasoning])

    return (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3" aria-live="polite" aria-busy={running}>
            {!timeline.loaded ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando a saída…
                </p>
            ) : timeline.items.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MessageSquareDashed className="h-4 w-4" aria-hidden /> {running ? "Aguardando o agente…" : "Nenhuma saída ainda."}
                </p>
            ) : (
                <ol className="space-y-3">
                    <AnimatePresence initial={false}>
                        {timeline.items.map((item) => (
                            <motion.li key={item.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                                <TimelineItemView item={item} />
                            </motion.li>
                        ))}
                    </AnimatePresence>
                </ol>
            )}
            <AnimatePresence>
                {running && timeline.loaded && (
                    <motion.p key="working" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        {timeline.reasoning ? <Brain className="h-3.5 w-3.5 animate-pulse text-primary" aria-hidden /> : <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                        {timeline.reasoning ? "Pensando…" : "Trabalhando…"}
                    </motion.p>
                )}
            </AnimatePresence>
        </div>
    )
}
