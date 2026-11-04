"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CircleStop, Hourglass, ListChecks, PlugZap, RotateCcw, Square, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useReplyFallback } from "@/components/agent-reply/ReplyTargetProvider"
import { insertQuote } from "@/lib/markdown/quote"
import { useRefinementControls } from "@/features/refinement/hooks/useRefinementControls"
import { RefinementCloseDialog, RefinementRestartDialog } from "@/features/refinement/components/RefinementDialogs"
import { RefinementLiveMessage } from "@/features/refinement/components/RefinementLiveMessage"
import type { TaskRefinementStateDto } from "@/features/refinement/types"
import { PENDING_TURN_LABELS } from "../../constants"
import { useWorkbenchAction } from "../../hooks/useAgentic"
import { useFieldAttachments } from "../../hooks/useWorkbenchFiles"
import { startFieldKey, takeStartDraft } from "../../start-draft"
import type { WorkbenchDto } from "../../types"
import { ImplementInfoField } from "./ImplementInfoField"
import { PlanAfterRefinementSwitch } from "./PlanAfterRefinementSwitch"
import { ReconnectButton } from "./ReconnectButton"
import { WorkbenchModelSettings } from "./WorkbenchModelSettings"

const ICON_BUTTON = "h-8 min-w-8 px-2 max-md:shrink-0"
const ACTION_BUTTON = "gap-1.5 max-md:shrink-0 max-md:px-2.5"
const PLAN_HINT = "Essas informações (e os arquivos anexados) vão ao planejador junto da tarefa e da especificação técnica."

/**
 * Barra da mesa no refinamento (OPE-137). Em "Refinando": Parar/Continuar, Reconectar (ciclo automático),
 * Recomeçar, Encerrar refinamento, o switch "Gerar plano após refinar" e o modelo do Refinamento — as
 * ações vão ao refinamento da tarefa (o mesmo da página da tarefa). Em "Especificação pronta": Gerar plano
 * (com informações adicionais), Continuar refinamento e Recomeçar, que passam pela mesa (vaga da central).
 */
export function RefinementActionBar({ workbench, state }: { workbench: WorkbenchDto; state: TaskRefinementStateDto | undefined }) {
    const refinement = state?.refinement ?? null
    const availability = state?.availability ?? null
    const { action, running, reconnectable, autoReconnect } = useRefinementControls(workbench.taskId, refinement)
    const mutation = useWorkbenchAction(workbench)
    const planFiles = useFieldAttachments(startFieldKey(workbench.taskId))
    const [planText, setPlanText] = useState(() => takeStartDraft(workbench.taskId))
    const [confirm, setConfirm] = useState<"restart" | "close" | null>(null)
    const refining = workbench.stage === "refining"
    const slotQueue = workbench.slotQueue
    const pending = action.isPending || mutation.isPending
    const unavailableReason = availability && !availability.available ? (availability.reason ?? "Refinar tarefa indisponível") : null
    const failed = refinement?.runState === "failed" || refinement?.runState === "interrupted"
    // Citação da saída sem pergunta aberta: vai para o campo do "Gerar plano" (Especificação pronta).
    useReplyFallback(
        !refining && !slotQueue
            ? (quote) => {
                  setPlanText((current) => insertQuote(current, current.length, quote).value)
                  return true
              }
            : null,
    )
    const restart = () => (refining ? action.mutate("restart") : mutation.mutate({ action: "restart-refinement" }))

    return (
        <div className="space-y-2 border-t p-3" data-ctrl-enter-scope>
            <AnimatePresence initial={false}>
                {refining && (failed || (refinement?.runState === "idle" && !refinement.concluded)) && refinement?.error && (
                    <motion.p key="error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
                        {refinement.error}
                    </motion.p>
                )}
                {refining && autoReconnect.notice && (
                    <motion.p key="reconnect-notice" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                        <PlugZap className="h-3.5 w-3.5" aria-hidden /> {autoReconnect.notice}
                    </motion.p>
                )}
                {refining && refinement?.finalizing && (
                    <motion.p key="finalizing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-muted-foreground" role="status">
                        Consolidando a especificação técnica…
                    </motion.p>
                )}
                {slotQueue && (
                    <motion.p key="slot-queue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                        <Hourglass className="h-3.5 w-3.5 shrink-0" aria-hidden /> Aguardando vaga na central{slotQueue.position ? ` — posição #${slotQueue.position}` : ""}: {PENDING_TURN_LABELS[slotQueue.action]}.
                    </motion.p>
                )}
                {!refining && !slotQueue && <ImplementInfoField key="plan-info" id={`workbench-plan-info-${workbench.id}`} value={planText} onValueChange={setPlanText} attachments={planFiles} hint={PLAN_HINT} />}
            </AnimatePresence>
            {refining && refinement && <RefinementLiveMessage taskId={workbench.taskId} refinement={refinement} />}

            <div className="flex flex-wrap items-center gap-2">
                <div className="mr-auto flex min-w-0 max-w-full items-center gap-3">
                    <WorkbenchModelSettings workbench={workbench} buttonClassName={ICON_BUTTON} />
                    {refining && <Separator orientation="vertical" className="h-5" />}
                    <PlanAfterRefinementSwitch workbench={workbench} />
                </div>
                <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2 max-md:max-w-full max-md:flex-nowrap max-md:gap-1.5 max-md:overflow-x-auto max-md:pb-0.5">
                    {refining ? (
                        <>
                            {running ? (
                                <Button type="button" variant="outline" size="sm" className={ACTION_BUTTON} disabled={pending} onClick={() => action.mutate("interrupt")}>
                                    <Square className="h-3.5 w-3.5" aria-hidden /> Parar
                                </Button>
                            ) : (
                                refinement && (
                                    <Button type="button" variant="outline" size="sm" className={ACTION_BUTTON} disabled={pending || Boolean(unavailableReason)} title={unavailableReason ?? undefined} onClick={() => action.mutate("continue")}>
                                        <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Continuar
                                    </Button>
                                )
                            )}
                            {reconnectable && <ReconnectButton reconnecting={autoReconnect.reconnecting} className={ACTION_BUTTON} onClick={autoReconnect.retryNow} />}
                            <Button type="button" variant="outline" size="sm" className={ACTION_BUTTON} disabled={pending || running || !refinement} onClick={() => setConfirm("restart")}>
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Recomeçar
                            </Button>
                            <Button type="button" size="sm" className={ACTION_BUTTON} disabled={pending || !refinement} onClick={() => setConfirm("close")}>
                                <CircleStop className="h-3.5 w-3.5" aria-hidden /> Encerrar refinamento
                            </Button>
                        </>
                    ) : slotQueue ? (
                        <Button type="button" variant="outline" size="sm" className={ACTION_BUTTON} disabled={pending} onClick={() => mutation.mutate({ action: "cancel-wait" })}>
                            <X className="h-3.5 w-3.5" aria-hidden /> Cancelar espera
                        </Button>
                    ) : (
                        <>
                            <Button type="button" variant="outline" size="sm" className={ACTION_BUTTON} disabled={pending || Boolean(unavailableReason)} title={unavailableReason ?? undefined} onClick={() => mutation.mutate({ action: "continue-refinement" })}>
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Continuar refinamento
                            </Button>
                            <Button type="button" variant="outline" size="sm" className={ACTION_BUTTON} disabled={pending || Boolean(unavailableReason)} title={unavailableReason ?? undefined} onClick={() => setConfirm("restart")}>
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Recomeçar
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                data-ctrl-enter-submit
                                className={ACTION_BUTTON}
                                disabled={pending || Boolean(planFiles.blockReason)}
                                title={planFiles.blockReason ?? undefined}
                                onClick={() =>
                                    mutation.mutate(
                                        { action: "generate-plan", text: planText.trim() || undefined, ...(planFiles.fileIds.length ? { fileIds: planFiles.fileIds } : {}) },
                                        {
                                            onSuccess: () => {
                                                setPlanText("")
                                                planFiles.clearSent()
                                            },
                                        },
                                    )
                                }
                            >
                                <ListChecks className="h-3.5 w-3.5" aria-hidden /> Gerar plano
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {refining && reconnectable && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <PlugZap className="h-3.5 w-3.5" aria-hidden /> Reconectar acompanha a sessão existente sem reenviar a mensagem (use se o agente ainda estiver rodando).
                </p>
            )}

            <RefinementRestartDialog open={confirm === "restart"} onOpenChange={(open) => setConfirm(open ? "restart" : null)} onConfirm={restart} />
            <RefinementCloseDialog open={confirm === "close"} onOpenChange={(open) => setConfirm(open ? "close" : null)} onConfirm={() => action.mutate("close")} />
        </div>
    )
}
