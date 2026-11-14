"use client"

import { useState } from "react"
import { AnimatePresence } from "framer-motion"
import { CircleStop, ListChecks, PlugZap, RotateCcw, Square, X } from "lucide-react"
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
import type { CentralDto, WorkbenchDto } from "../../types"
import { useCompactWorkbench } from "../../hooks/useCompactWorkbench"
import { PENDING_REASON } from "../../workbench-action-items"
import { RECONNECT_HINT, reconnectHintNotice, type StatusNotice } from "../../workbench-notices"
import { StatusNoticeList } from "./WorkbenchStatusNotices"
import { RefinementMobileBar, type RefinementButton } from "./mobile/RefinementMobileBar"
import { ImplementInfoField } from "./ImplementInfoField"
import { PlanAfterRefinementSwitch } from "./PlanAfterRefinementSwitch"
import { ReconnectButton } from "./ReconnectButton"
import { ACTION_BUTTON, ICON_BUTTON } from "./WorkbenchActionButton"
import { WorkbenchModelSettings } from "./WorkbenchModelSettings"

const present = (list: (RefinementButton | null)[]): RefinementButton[] => list.filter((button): button is RefinementButton => button !== null)

const PLAN_HINT = "Essas informações (e os arquivos anexados) vão ao planejador junto da tarefa e da especificação técnica."

/**
 * Barra da mesa no refinamento (OPE-137). Em "Refinando": Parar/Continuar, Reconectar (ciclo automático),
 * Recomeçar, Encerrar refinamento, o switch "Gerar plano após refinar" e o modelo do Refinamento — as
 * ações vão ao refinamento da tarefa (o mesmo da página da tarefa). Em "Especificação pronta": Gerar plano
 * (com informações adicionais), Continuar refinamento e Recomeçar, que passam pela mesa (vaga da central).
 * Abaixo de `lg` (OPE-166) vira o dock do celular (`RefinementMobileBar`): o botão principal (Encerrar
 * refinamento, Gerar plano ou Cancelar espera) e os demais na folha "Mais ações".
 */
export function RefinementActionBar({ workbench, central = null, state }: { workbench: WorkbenchDto; central?: CentralDto | null; state: TaskRefinementStateDto | undefined }) {
    const compact = useCompactWorkbench()
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
    const busy = pending ? PENDING_REASON : null
    const noRefinement = refinement ? null : "O refinamento ainda não carregou"

    const notices: StatusNotice[] = []
    if (refining && (failed || (refinement?.runState === "idle" && !refinement.concluded)) && refinement?.error) notices.push({ key: "error", tone: "error", icon: "info", text: refinement.error, role: "alert" })
    if (refining && autoReconnect.notice) notices.push({ key: "reconnect-notice", tone: "muted", icon: "plug", text: autoReconnect.notice, role: "status" })
    if (refining && refinement?.finalizing) notices.push({ key: "finalizing", tone: "muted", icon: "info", text: "Consolidando a especificação técnica…", role: "status" })
    if (slotQueue) notices.push({ key: "slot-queue", tone: "muted", icon: "hourglass", text: `Aguardando vaga na central${slotQueue.position ? ` — posição #${slotQueue.position}` : ""}: ${PENDING_TURN_LABELS[slotQueue.action]}.`, role: "status" })

    // Botões da etapa, na ordem do desktop; `primary` é o botão principal do dock do celular.
    const buttons: RefinementButton[] = refining
        ? present([
              running
                  ? { key: "interrupt", label: "Parar", icon: Square, variant: "outline", disabledReason: busy, onSelect: () => action.mutate("interrupt") }
                  : refinement
                    ? { key: "continue", label: "Continuar", icon: RotateCcw, variant: "outline", disabledReason: busy ?? unavailableReason, title: unavailableReason, onSelect: () => action.mutate("continue") }
                    : null,
              reconnectable ? { key: "reconnect", label: "Reconectar ao agente", icon: PlugZap, variant: "outline", disabledReason: null, reconnect: true, hint: RECONNECT_HINT, onSelect: autoReconnect.retryNow } : null,
              { key: "restart", label: "Recomeçar", icon: RotateCcw, variant: "outline", disabledReason: busy ?? (running ? "Pare o refinamento antes de recomeçar" : noRefinement), onSelect: () => setConfirm("restart") },
              { key: "close", label: "Encerrar refinamento", icon: CircleStop, variant: "default", disabledReason: busy ?? noRefinement, primary: true, onSelect: () => setConfirm("close") },
          ])
        : slotQueue
          ? [{ key: "cancel-wait", label: "Cancelar espera", icon: X, variant: "outline", disabledReason: busy, primary: true, onSelect: () => mutation.mutate({ action: "cancel-wait" }) }]
          : [
                { key: "continue-refinement", label: "Continuar refinamento", icon: RotateCcw, variant: "outline", disabledReason: busy ?? unavailableReason, title: unavailableReason, onSelect: () => mutation.mutate({ action: "continue-refinement" }) },
                { key: "restart", label: "Recomeçar", icon: RotateCcw, variant: "outline", disabledReason: busy ?? unavailableReason, title: unavailableReason, onSelect: () => setConfirm("restart") },
                {
                    key: "generate-plan",
                    label: "Gerar plano",
                    icon: ListChecks,
                    variant: "default",
                    disabledReason: busy ?? planFiles.blockReason,
                    title: planFiles.blockReason,
                    ctrlEnter: true,
                    primary: true,
                    onSelect: () =>
                        mutation.mutate(
                            { action: "generate-plan", text: planText.trim() || undefined, ...(planFiles.fileIds.length ? { fileIds: planFiles.fileIds } : {}) },
                            {
                                onSuccess: () => {
                                    setPlanText("")
                                    planFiles.clearSent()
                                },
                            },
                        ),
                },
            ]

    return (
        <div className="space-y-2 border-t p-3" data-ctrl-enter-scope>
            {!compact && <StatusNoticeList notices={notices} />}
            <AnimatePresence initial={false}>
                {!refining && !slotQueue && <ImplementInfoField key="plan-info" id={`workbench-plan-info-${workbench.id}`} value={planText} onValueChange={setPlanText} attachments={planFiles} hint={PLAN_HINT} collapsible={compact} />}
            </AnimatePresence>
            {refining && refinement && <RefinementLiveMessage taskId={workbench.taskId} refinement={refinement} compact={compact} />}

            {compact ? (
                <RefinementMobileBar workbench={workbench} central={central} buttons={buttons} notices={refining && reconnectable ? [...notices, reconnectHintNotice] : notices} reconnecting={autoReconnect.reconnecting} />
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="mr-auto flex min-w-0 max-w-full items-center gap-3">
                            <WorkbenchModelSettings workbench={workbench} buttonClassName={ICON_BUTTON} />
                            {refining && <Separator orientation="vertical" className="h-5" />}
                            <PlanAfterRefinementSwitch workbench={workbench} />
                        </div>
                        <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2">
                            {buttons.map((button) =>
                                button.reconnect ? (
                                    <ReconnectButton key={button.key} reconnecting={autoReconnect.reconnecting} className={ACTION_BUTTON} onClick={button.onSelect} />
                                ) : (
                                    <Button
                                        key={button.key}
                                        type="button"
                                        variant={button.variant}
                                        size="sm"
                                        data-ctrl-enter-submit={button.ctrlEnter || undefined}
                                        className={ACTION_BUTTON}
                                        disabled={button.disabledReason !== null}
                                        title={button.title ?? undefined}
                                        onClick={button.onSelect}
                                    >
                                        <button.icon className="h-3.5 w-3.5" aria-hidden /> {button.label}
                                    </Button>
                                ),
                            )}
                        </div>
                    </div>

                    {refining && reconnectable && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <PlugZap className="h-3.5 w-3.5" aria-hidden /> {RECONNECT_HINT}
                        </p>
                    )}
                </>
            )}

            <RefinementRestartDialog open={confirm === "restart"} onOpenChange={(open) => setConfirm(open ? "restart" : null)} onConfirm={restart} />
            <RefinementCloseDialog open={confirm === "close"} onOpenChange={(open) => setConfirm(open ? "close" : null)} onConfirm={() => action.mutate("close")} />
        </div>
    )
}
