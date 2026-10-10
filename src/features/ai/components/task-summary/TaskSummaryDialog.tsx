"use client"

import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AlignLeft, Copy, RotateCcw, Square } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { dialogPanelMotion } from "@/components/motion/dialog-panel-motion"
import { taskDetailKey, TASKS_QUERY_KEY } from "@/features/tasks/hooks/useTasks"
import { useTaskSummaryStream } from "../../hooks/useTaskSummaryStream"
import { UnderstandActivity, UnderstandUsage } from "../understand-task/UnderstandStatus"

interface TaskSummaryDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    taskId: string
    taskCode: string
}

/** Modal que gera (ou regenera) o resumo de 1 linha da tarefa, mostrando a resposta conforme chega. */
export function TaskSummaryDialog({ open, onOpenChange, taskId, taskCode }: TaskSummaryDialogProps) {
    const { state, start, stop, reset } = useTaskSummaryStream(taskId)
    const queryClient = useQueryClient()
    const reduceMotion = useReducedMotion()
    const scrollRef = useRef<HTMLDivElement>(null)
    const running = state.status === "running"

    useEffect(() => {
        if (open) void start()
        else reset()
    }, [open, start, reset])

    // Resumo gravado: recarrega a tarefa para a tela já exibir o valor salvo.
    useEffect(() => {
        if (state.status !== "done") return
        void queryClient.invalidateQueries({ queryKey: [TASKS_QUERY_KEY, "list"] })
        void queryClient.invalidateQueries({ queryKey: taskDetailKey(taskId) })
    }, [state.status, queryClient, taskId])

    useEffect(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [state.text])

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(state.text.trim())
            toast.success("Resumo copiado")
        } catch {
            toast.error("Não foi possível copiar")
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
                <motion.div {...dialogPanelMotion} className="flex min-h-0 flex-1 flex-col">
                    <DialogHeader className="border-b p-5 pr-12">
                        <DialogTitle className="flex items-center gap-2">
                            <AlignLeft className="h-4 w-4 text-primary" aria-hidden /> Resumo de {taskCode}
                        </DialogTitle>
                        <DialogDescription>{state.model ? [state.provider === "opencode" ? "OpenCode" : "Gemini", state.model, state.agent && `agente ${state.agent}`].filter(Boolean).join(" · ") : "Preparando o resumo da tarefa…"}</DialogDescription>
                    </DialogHeader>

                    <div className="min-h-[160px] flex-1 overflow-y-auto p-5 text-sm" aria-live="polite" aria-busy={running}>
                        <UnderstandActivity state={state} />
                        {state.text && (
                            <div ref={scrollRef} className="relative whitespace-pre-wrap break-words">
                                {state.text}
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
