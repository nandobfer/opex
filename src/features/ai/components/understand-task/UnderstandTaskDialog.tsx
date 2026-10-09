"use client"

import { useEffect, useRef } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Copy, RotateCcw, Sparkles, Square } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Markdown } from "@/components/ui/markdown"
import { dialogPanelMotion } from "@/components/motion/dialog-panel-motion"
import { useUnderstandTaskStream } from "../../hooks/useUnderstandTaskStream"
import { UnderstandActivity, UnderstandUsage } from "./UnderstandStatus"

interface UnderstandTaskDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    taskId: string
    /** Título do modal (ex.: "Entender tarefa GO-DEV-42"). */
    title: string
}

/** Modal que explica a tarefa com IA, mostrando a resposta conforme ela é gerada. */
export function UnderstandTaskDialog({ open, onOpenChange, taskId, title }: UnderstandTaskDialogProps) {
    const { state, start, stop, reset } = useUnderstandTaskStream(taskId)
    const reduceMotion = useReducedMotion()
    const scrollRef = useRef<HTMLDivElement>(null)
    const stickRef = useRef(true)
    const running = state.status === "running"

    useEffect(() => {
        if (open) void start()
        else reset()
    }, [open, start, reset])

    // Acompanha o fim do texto enquanto o usuário não rolar para cima.
    useEffect(() => {
        const el = scrollRef.current
        if (el && stickRef.current) el.scrollTop = el.scrollHeight
    }, [state.text, state.tools.length])

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(state.text)
            toast.success("Explicação copiada")
        } catch {
            toast.error("Não foi possível copiar")
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
                <motion.div {...dialogPanelMotion} className="flex min-h-0 flex-1 flex-col">
                    <DialogHeader className="border-b p-5 pr-12">
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" aria-hidden /> {title}
                        </DialogTitle>
                        <DialogDescription>{state.model ? [state.provider === "opencode" ? "OpenCode" : "Gemini", state.model, state.agent && `agente ${state.agent}`].filter(Boolean).join(" · ") : "Preparando a análise da tarefa…"}</DialogDescription>
                    </DialogHeader>

                    <div
                        ref={scrollRef}
                        onScroll={(event) => {
                            const el = event.currentTarget
                            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
                        }}
                        className="min-h-[240px] flex-1 overflow-y-auto p-5 text-sm"
                        aria-live="polite"
                        aria-busy={running}
                    >
                        <UnderstandActivity state={state} />
                        {state.text && (
                            <div className="relative">
                                <Markdown>{state.text}</Markdown>
                                {running && (
                                    <motion.span
                                        aria-hidden
                                        className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 rounded-sm bg-primary"
                                        animate={reduceMotion ? undefined : { opacity: [1, 0.2, 1] }}
                                        transition={{ repeat: Infinity, duration: 0.9 }}
                                    />
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t p-4">
                        <UnderstandUsage state={state} />
                        <div className="ml-auto flex gap-2">
                            <AnimatePresence mode="wait" initial={false}>
                                {running ? (
                                    <motion.span key="stop" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }}>
                                        <Button type="button" variant="outline" className="gap-1.5" onClick={stop}>
                                            <Square className="h-3.5 w-3.5" aria-hidden /> Parar
                                        </Button>
                                    </motion.span>
                                ) : (
                                    <motion.span key="again" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }}>
                                        <Button type="button" variant="outline" className="gap-1.5" onClick={() => void start()}>
                                            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Gerar novamente
                                        </Button>
                                    </motion.span>
                                )}
                            </AnimatePresence>
                            <Button type="button" variant="outline" className="gap-1.5" disabled={!state.text || running} onClick={() => void copy()}>
                                <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar
                            </Button>
                            <Button type="button" onClick={() => onOpenChange(false)}>
                                Fechar
                            </Button>
                        </div>
                    </div>
                </motion.div>
            </DialogContent>
        </Dialog>
    )
}
