"use client"

import { useLayoutEffect, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowDown, Brain, Loader2, MessageSquareDashed } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useStickToBottom } from "../../hooks/useStickToBottom"
import type { TimelineState } from "../../timeline"
import { TimelineItemView } from "./TimelineItemView"

/**
 * Saída da IA ao vivo; acompanha o fim enquanto o usuário não rolar para cima. `footer` entra no fim
 * da mesma área rolável (ex.: integração do fork), como o último bloco da conversa; `footerKey`
 * identifica o bloco (anima a troca e prende ao fim quando ele muda).
 */
export function Timeline({ timeline, running, footer = null, footerKey = null }: { timeline: TimelineState; running: boolean; footer?: ReactNode; footerKey?: string | null }) {
    const { scrollRef, atBottom, stickToBottom, scrollToBottom } = useStickToBottom()
    const reduceMotion = useReducedMotion()

    // A cada mudança da saída (inclusive itens do meio, como o fim de um turno) prende ao fim,
    // se o usuário ainda estiver acompanhando.
    useLayoutEffect(() => {
        stickToBottom()
    }, [timeline, running, footerKey, stickToBottom])

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
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
                <AnimatePresence initial={false}>
                    {footer && timeline.loaded && (
                        <motion.div key={footerKey ?? "footer"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="mt-3">
                            {footer}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            <AnimatePresence>
                {!atBottom && (
                    <motion.div key="to-bottom" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.18 }} className="absolute bottom-3 right-4">
                        <Button type="button" size="icon" variant="outline" aria-label="Ir para o final" className="rounded-full bg-background/90 shadow-md backdrop-blur" onClick={() => scrollToBottom(reduceMotion ? "auto" : "smooth")}>
                            <ArrowDown aria-hidden />
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
