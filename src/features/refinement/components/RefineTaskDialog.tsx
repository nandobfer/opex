"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, Loader2, Info, RotateCcw, Square, Wand2 } from "lucide-react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { dialogPanelMotion } from "@/components/motion/dialog-panel-motion"
import { Timeline } from "@/features/agentic/components/workbench/Timeline"
import { apiErrorMessage } from "@/lib/api"
import { useRefinementAction, useRefinementRealtime, useStartRefinement, useTaskRefinement } from "../hooks/useRefinement"
import { useRefinementStream } from "../hooks/useRefinementStream"
import { refinementWaitingReason } from "../logic"
import { RefinementRequests } from "./RefinementRequests"

interface RefineTaskDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    taskId: string
    taskCode: string
}

/** Modal que refina a tarefa com um agente do OpenCode: saída ao vivo e perguntas a responder. */
export function RefineTaskDialog({ open, onOpenChange, taskId, taskCode }: RefineTaskDialogProps) {
    useRefinementRealtime(taskId)
    const query = useTaskRefinement(taskId, open)
    const start = useStartRefinement(taskId)
    const action = useRefinementAction(taskId)
    const refinement = query.data?.refinement ?? null
    const availability = query.data?.availability ?? null
    const { timeline } = useRefinementStream(open && refinement ? taskId : null)
    const running = refinement?.runState === "running"
    const [confirmRestart, setConfirmRestart] = useState(false)
    const startedRef = useRef(false)

    // Ao abrir, inicia o refinamento quando ainda não existe e a feature está disponível.
    useEffect(() => {
        if (!open) {
            startedRef.current = false
            return
        }
        if (!query.data || query.data.refinement || !query.data.availability.available || startedRef.current) return
        startedRef.current = true
        start.mutate()
    }, [open, query.data, start])

    const waiting = refinement ? refinementWaitingReason({ runState: refinement.runState, pendingPermissions: refinement.pendingPermissions.length, pendingForms: refinement.pendingForms.length, resolved: refinement.resolved }) : null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
                <motion.div {...dialogPanelMotion} className="flex min-h-0 flex-1 flex-col">
                    <DialogHeader className="border-b p-5 pr-12">
                        <DialogTitle className="flex items-center gap-2">
                            <Wand2 className="h-4 w-4 text-primary" aria-hidden /> Refinar tarefa {taskCode}
                        </DialogTitle>
                        <DialogDescription>
                            {availability && !availability.available
                                ? (availability.reason ?? "Refinar tarefa indisponível")
                                : running
                                  ? "O agente está lendo a tarefa e preparando as perguntas…"
                                  : (waiting ?? (refinement?.sessionDirectory ? `Sessão em ${refinement.sessionDirectory}` : "O agente fará perguntas até a especificação técnica ficar clara."))}
                        </DialogDescription>
                    </DialogHeader>

                    {availability && !availability.available ? (
                        <div className="flex items-start gap-2 p-5 text-sm text-muted-foreground">
                            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {availability.reason}
                        </div>
                    ) : query.isLoading ? (
                        <p className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando o refinamento…
                        </p>
                    ) : query.isError ? (
                        <p className="p-5 text-sm text-destructive">{apiErrorMessage(query.error, "Não foi possível carregar o refinamento")}</p>
                    ) : (
                        <>
                            <Timeline timeline={timeline} running={Boolean(running)} />
                            {refinement && <RefinementRequests taskId={taskId} refinement={refinement} />}
                        </>
                    )}

                    <AnimatePresence initial={false}>
                        {refinement?.resolved && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2 border-t bg-emerald-500/10 px-5 py-2 text-xs text-emerald-300">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> Especificação técnica esclarecida e salva na tarefa.
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="flex flex-wrap items-center gap-2 border-t p-4">
                        <AnimatePresence mode="wait" initial={false}>
                            {running ? (
                                <motion.span key="stop" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }}>
                                    <Button type="button" variant="outline" className="gap-1.5" disabled={action.isPending} onClick={() => action.mutate("interrupt")}>
                                        <Square className="h-3.5 w-3.5" aria-hidden /> Parar
                                    </Button>
                                </motion.span>
                            ) : (refinement?.runState === "failed" || refinement?.runState === "interrupted") ? (
                                <motion.span key="continue" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }}>
                                    <Button type="button" variant="outline" className="gap-1.5" disabled={action.isPending} onClick={() => action.mutate("continue")}>
                                        <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Continuar
                                    </Button>
                                </motion.span>
                            ) : null}
                        </AnimatePresence>
                        <div className="ml-auto flex gap-2">
                            <Button type="button" variant="outline" className="gap-1.5" disabled={action.isPending || running} onClick={() => setConfirmRestart(true)}>
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Recomeçar
                            </Button>
                            <Button type="button" onClick={() => onOpenChange(false)}>
                                Fechar
                            </Button>
                        </div>
                    </div>
                </motion.div>
            </DialogContent>

            <AlertDialog open={confirmRestart} onOpenChange={setConfirmRestart}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Recomeçar o refinamento?</AlertDialogTitle>
                        <AlertDialogDescription>A conversa atual é descartada e uma nova sessão começa do zero. A especificação já salva na tarefa é mantida.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                setConfirmRestart(false)
                                startedRef.current = true
                                action.mutate("restart")
                            }}
                        >
                            Recomeçar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    )
}
