"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, CircleStop, Info, Loader2, RotateCcw, Square, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ReplyTargetProvider } from "@/components/agent-reply/ReplyTargetProvider"
import { Timeline } from "@/features/agentic/components/workbench/Timeline"
import { ReconnectButton } from "@/features/agentic/components/workbench/ReconnectButton"
import { apiErrorMessage } from "@/lib/api"
import { useRefinementRealtime, useStartRefinement, useTaskRefinement } from "../hooks/useRefinement"
import { useRefinementControls } from "../hooks/useRefinementControls"
import { useRefinementStream } from "../hooks/useRefinementStream"
import { refinementConcluded, refinementWaitingReason } from "../logic"
import { RefinementCloseDialog, RefinementRestartDialog } from "./RefinementDialogs"
import { RefinementLiveMessage } from "./RefinementLiveMessage"
import { RefinementRequests } from "./RefinementRequests"

interface RefinementPanelProps {
    taskId: string
    taskCode: string
    /** Inicia o refinamento ao montar (o botão do cabeçalho abre a aba com esta intenção). */
    autoStart?: boolean
    /** Chamado uma única vez quando a intenção de iniciar é consumida. */
    onAutoStarted?: () => void
}

/**
 * Painel do refinamento dentro da aba "Especificação técnica": saída do agente ao vivo (área própria)
 * e perguntas logo abaixo, sem o limite de altura do antigo modal. O botão do cabeçalho abre a aba
 * com `autoStart`; abrir a aba pelo próprio clique apenas mostra o conteúdo. É o MESMO refinamento da
 * mesa de trabalho (OPE-137): com a mesa em "Refinando", aparece também **Encerrar refinamento**; com a
 * mesa do planejamento em diante, o refinamento fica bloqueado com o motivo.
 */
export function RefinementPanel({ taskId, taskCode, autoStart = false, onAutoStarted }: RefinementPanelProps) {
    useRefinementRealtime(taskId)
    const query = useTaskRefinement(taskId)
    const start = useStartRefinement(taskId)
    const refinement = query.data?.refinement ?? null
    const availability = query.data?.availability ?? null
    const workbenchStage = query.data?.workbench?.stage ?? null
    const { timeline } = useRefinementStream(refinement ? taskId : null)
    const { action, running, reconnectable, autoReconnect } = useRefinementControls(taskId, refinement)
    const [confirm, setConfirm] = useState<"restart" | "close" | null>(null)
    const startedRef = useRef(false)

    // Consome a intenção de iniciar (vinda do botão do cabeçalho) uma única vez.
    useEffect(() => {
        if (!autoStart) {
            startedRef.current = false
            return
        }
        if (!query.data || startedRef.current) return
        startedRef.current = true
        onAutoStarted?.()
        if (!query.data.refinement && query.data.availability.available) start.mutate()
    }, [autoStart, query.data, start, onAutoStarted])

    const waiting = refinement
        ? refinementWaitingReason({ runState: refinement.runState, pendingPermissions: refinement.pendingPermissions.length, pendingForms: refinement.pendingForms.length, resolved: refinement.resolved, closed: refinement.closed, queued: refinement.queued })
        : null
    const unavailable = Boolean(availability && !availability.available)
    // Mesa do planejamento em diante (item 18): nada de continuar ou recomeçar por aqui.
    const blockedReason = unavailable ? (availability?.reason ?? "Refinar tarefa indisponível") : null
    const canClose = workbenchStage === "refining" && Boolean(refinement)

    const description = unavailable && (!refinement || blockedReason)
        ? (blockedReason ?? "Refinar tarefa indisponível")
        : running
          ? (refinement?.finalizing ? "Consolidando a especificação técnica…" : "O agente está lendo a tarefa e preparando as perguntas…")
          : (waiting ?? (refinement?.sessionDirectory ? `Sessão em ${refinement.sessionDirectory}` : "O agente fará perguntas até a especificação técnica ficar clara."))

    return (
        <section className="space-y-3 border-t pt-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <Wand2 className="h-4 w-4 text-primary" aria-hidden /> Refinamento com IA
                    </h3>
                    <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <AnimatePresence mode="wait" initial={false}>
                        {running ? (
                            <motion.span key="stop" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }}>
                                <Button type="button" variant="outline" className="gap-1.5" disabled={action.isPending} onClick={() => action.mutate("interrupt")}>
                                    <Square className="h-3.5 w-3.5" aria-hidden /> Parar
                                </Button>
                            </motion.span>
                        ) : refinement && !refinementConcluded(refinement) && !blockedReason ? (
                            <motion.span key="continue" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }}>
                                <Button type="button" variant="outline" className="gap-1.5" disabled={action.isPending} onClick={() => action.mutate("continue")}>
                                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Continuar
                                </Button>
                            </motion.span>
                        ) : !refinement && availability?.available ? (
                            <motion.span key="start" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }}>
                                <Button type="button" className="gap-1.5" aria-label={`Refinar tarefa ${taskCode}`} disabled={start.isPending} onClick={() => start.mutate()}>
                                    {start.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Wand2 className="h-3.5 w-3.5" aria-hidden />} Refinar tarefa
                                </Button>
                            </motion.span>
                        ) : null}
                    </AnimatePresence>
                    {reconnectable && <ReconnectButton reconnecting={autoReconnect.reconnecting} size="default" onClick={autoReconnect.retryNow} />}
                    {canClose && (
                        <Button type="button" variant="outline" className="gap-1.5" disabled={action.isPending} onClick={() => setConfirm("close")}>
                            <CircleStop className="h-3.5 w-3.5" aria-hidden /> Encerrar refinamento
                        </Button>
                    )}
                    {refinement && !blockedReason && (
                        <Button type="button" variant="outline" className="gap-1.5" disabled={action.isPending || running} onClick={() => setConfirm("restart")}>
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Recomeçar
                        </Button>
                    )}
                </div>
            </div>

            <AnimatePresence initial={false}>
                {autoReconnect.notice && (
                    <motion.p key="reconnect-notice" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden /> {autoReconnect.notice}
                    </motion.p>
                )}
            </AnimatePresence>

            {unavailable && (!refinement || blockedReason) && (
                <p className="flex items-start gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {availability?.reason}
                </p>
            )}
            {query.isLoading ? (
                <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando o refinamento…
                </p>
            ) : query.isError ? (
                <p className="p-3 text-sm text-destructive">{apiErrorMessage(query.error, "Não foi possível carregar o refinamento")}</p>
            ) : refinement ? (
                // Linhas da saída citáveis nas respostas das perguntas pendentes (sem pergunta: área de transferência).
                <ReplyTargetProvider>
                    <div className="flex h-[40vh] max-h-[28rem] min-h-[18rem] flex-col overflow-hidden rounded-md border">
                        <Timeline timeline={timeline} running={Boolean(running)} />
                    </div>
                    <RefinementRequests taskId={taskId} refinement={refinement} />
                    <RefinementLiveMessage taskId={taskId} refinement={refinement} />
                </ReplyTargetProvider>
            ) : null}

            <AnimatePresence initial={false}>
                {refinement?.resolved && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> Especificação técnica esclarecida e salva na tarefa.
                    </motion.div>
                )}
            </AnimatePresence>

            <RefinementRestartDialog open={confirm === "restart"} onOpenChange={(open) => setConfirm(open ? "restart" : null)} onConfirm={() => action.mutate("restart")} />
            <RefinementCloseDialog open={confirm === "close"} onOpenChange={(open) => setConfirm(open ? "close" : null)} onConfirm={() => action.mutate("close")} />
        </section>
    )
}
