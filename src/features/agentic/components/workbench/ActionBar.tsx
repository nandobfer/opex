"use client"

import { useState } from "react"
import { AnimatePresence } from "framer-motion"
import { PlugZap } from "lucide-react"
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
import { Separator } from "@/components/ui/separator"
import { useReplyFallback } from "@/components/agent-reply/ReplyTargetProvider"
import { insertQuote } from "@/lib/markdown/quote"
import { useSendWorkbenchLiveMessage, useWorkbenchAction, useWorkbenchReconnect } from "../../hooks/useAgentic"
import { useCompactWorkbench } from "../../hooks/useCompactWorkbench"
import { workbenchActions, type WorkbenchAction } from "../../logic"
import type { CentralDto, ForkDto, WorkbenchDto } from "../../types"
import { PENDING_TURN_LABELS } from "../../constants"
import { FEEDBACK, isFeedback, workbenchActionItems, type FeedbackAction, type WorkbenchActionItem } from "../../workbench-action-items"
import { reconnectHintNotice, RECONNECT_HINT, workbenchNotices } from "../../workbench-notices"
import { useFieldAttachments, type FieldAttachments } from "../../hooks/useWorkbenchFiles"
import { FeedbackComposer } from "./FeedbackComposer"
import { ForkComposer } from "./ForkComposer"
import { ImplementInfoField } from "./ImplementInfoField"
import { LiveMessageComposer } from "./LiveMessageComposer"
import { useAutoReconnect } from "../../hooks/useAutoReconnect"
import { PreviewSwitch, previewSwitchVisible } from "./PreviewSwitch"
import { ICON_BUTTON, WorkbenchActionButton } from "./WorkbenchActionButton"
import { WorkbenchModelSettings } from "./WorkbenchModelSettings"
import { StatusNoticeList } from "./WorkbenchStatusNotices"
import { WorkbenchMobileBar } from "./mobile/WorkbenchMobileBar"
import { AdversarialActions } from "@/features/adversarial-agent/components/workbench/AdversarialActions"

/**
 * Botões da etapa atual; correções abrem o campo de texto que vai para o planejador. No desktop (`>= lg`)
 * é a linha de botões; abaixo de `lg` (OPE-166) vira o dock com a ação principal e a folha "Mais ações"
 * (`WorkbenchMobileBar`). Os dois leem o mesmo descritor (`workbenchActionItems`). `central` alimenta o
 * "Excluir mesa" da folha do celular.
 */
export function ActionBar({ workbench, central = null, onForkOpened }: { workbench: WorkbenchDto; central?: CentralDto | null; onForkOpened?: (fork: ForkDto) => void }) {
    const compact = useCompactWorkbench()
    const mutation = useWorkbenchAction(workbench)
    const reconnect = useWorkbenchReconnect(workbench.id)
    const slotQueue = workbench.slotQueue
    const actions = workbenchActions(workbench.stage, workbench.runState, Boolean(workbench.previewUrl), Boolean(workbench.sessionId), Boolean(slotQueue))
    const failed = workbench.runState === "failed" || workbench.runState === "interrupted"
    // Ciclo automático de reconexão: dispara quando a tela passa a oferecer Reconectar (e ao abrir
    // já nesse estado). Nunca depois de um Parar do usuário; um ciclo por episódio de queda.
    const autoReconnect = useAutoReconnect({
        eligible: actions.includes("reconnect") && failed && !workbench.stoppedByUser,
        episodeKey: `${workbench.id}:${workbench.turnStartedAt ?? workbench.startedAt}`,
        attempt: () => reconnect.mutateAsync().then((saved) => (saved.runState === "running" ? "attached" : (saved.reconnect?.outcome ?? null)), () => null),
    })
    const [composer, setComposer] = useState<FeedbackAction | null>(workbench.stage === "changes_requested" && workbench.runState === "idle" ? "submit-pr-feedback" : null)
    const [text, setText] = useState("")
    const [additional, setAdditional] = useState("")
    const [confirm, setConfirm] = useState<"interrupt" | "approve" | "cancel-wait" | null>(null)
    const [forking, setForking] = useState(false)
    const [liveText, setLiveText] = useState("")
    const liveMessage = useSendWorkbenchLiveMessage(workbench.id)
    // Chat durante a execução: com o agente trabalhando (e a opção ligada), mensagens entram no turno atual.
    // A revisão do agente adversário não recebe mensagens: ele revisa sem interferência.
    const liveChat = workbench.liveChat && workbench.runState === "running" && !slotQueue && !workbench.deletionRequestedAt && workbench.stage !== "adversarial_review"
    const pending = mutation.isPending
    const feedbackFiles = useFieldAttachments(`feedback:${workbench.id}`)
    const implementFiles = useFieldAttachments(`implement:${workbench.id}`)
    const liveFiles = useFieldAttachments(`live:${workbench.id}`)
    const run = (action: WorkbenchAction, body?: string, files?: FieldAttachments) =>
        mutation.mutate(
            { action, text: body, ...(files?.fileIds.length ? { fileIds: files.fileIds } : {}) },
            {
                onSuccess: () => {
                    setComposer(null)
                    setText("")
                    setAdditional("")
                    files?.clearSent()
                },
            },
        )
    // Ao aprovar o plano, o usuário pode anexar informações adicionais ao prompt de implementação.
    const canImplement = actions.includes("implement")
    // Citação de linha da saída da IA sem campo aberto: abre o primeiro feedback da etapa já com ela.
    const feedbackAction = actions.find(isFeedback) ?? null
    useReplyFallback(
        feedbackAction && !pending
            ? (quote) => {
                  setForking(false)
                  setComposer((current) => current ?? feedbackAction)
                  setText((current) => insertQuote(current, current.length, quote).value)
                  return true
              }
            : liveChat && !forking
              ? (quote) => {
                    setLiveText((current) => insertQuote(current, current.length, quote).value)
                    return true
                }
              : null,
    )

    const items = workbenchActionItems({ actions, failed, pending, prOpen: workbench.pr?.state === "open", deleting: Boolean(workbench.deletionRequestedAt), implementBlockReason: implementFiles.blockReason })
    const notices = workbenchNotices(workbench, { failed, reconnectNotice: autoReconnect.notice })
    const adversarialAvailable = actions.some((action) => action.startsWith("adversarial-"))
    const editing = Boolean(composer) || forking
    const select = (item: WorkbenchActionItem) => {
        if (item.id === "fork") return setForking(true)
        if (item.id === "reconnect") return autoReconnect.retryNow()
        if (isFeedback(item.id)) return setComposer(item.id)
        if (item.id === "implement") return run("implement", additional.trim() || undefined, implementFiles)
        if (item.id === "retry") return run("retry")
        if (item.id === "approve" || item.id === "interrupt" || item.id === "cancel-wait") setConfirm(item.id)
    }

    return (
        <div className="space-y-2 border-t p-3" data-ctrl-enter-scope>
            {!compact && <StatusNoticeList notices={notices} />}
            <AnimatePresence initial={false}>
                {!editing && canImplement && <ImplementInfoField key="implement-info" value={additional} onValueChange={setAdditional} attachments={implementFiles} collapsible={compact} />}
                {composer && <FeedbackComposer key="composer" copy={FEEDBACK[composer]} value={text} onValueChange={setText} attachments={feedbackFiles} pending={pending} rows={compact ? 3 : 4} onCancel={() => setComposer(null)} onSubmit={(value) => run(composer, value, feedbackFiles)} />}
                {liveChat && !editing && (
                    <LiveMessageComposer
                        key="live-message"
                        id="workbench-live-message"
                        value={liveText}
                        onValueChange={setLiveText}
                        attachments={liveFiles}
                        pending={liveMessage.isPending}
                        compact={compact}
                        onSubmit={(value) =>
                            liveMessage.mutate(
                                { text: value, ...(liveFiles.fileIds.length ? { fileIds: liveFiles.fileIds } : {}) },
                                {
                                    onSuccess: () => {
                                        setLiveText("")
                                        liveFiles.clearSent()
                                    },
                                },
                            )
                        }
                    />
                )}
                {forking && !composer && (
                    <ForkComposer
                        key="fork-composer"
                        workbenchId={workbench.id}
                        onCancel={() => setForking(false)}
                        onOpened={(fork) => {
                            setForking(false)
                            onForkOpened?.(fork)
                        }}
                    />
                )}
            </AnimatePresence>

            {compact ? (
                <WorkbenchMobileBar
                    workbench={workbench}
                    central={central}
                    items={items}
                    notices={!composer && actions.includes("reconnect") ? [...notices, reconnectHintNotice] : notices}
                    editing={editing}
                    reconnecting={autoReconnect.reconnecting}
                    adversarialBlocked={actions.includes("adversarial-fix")}
                    adversarialAvailable={adversarialAvailable}
                    rebuildAvailable={actions.includes("rebuild-preview")}
                    actionPending={pending}
                    onRebuild={() => run("rebuild-preview")}
                    onSelect={select}
                />
            ) : (
                <>
                    {/* Agente Adversário: decisões depois de um bloqueio ou de uma revisão que falhou. */}
                    {!editing && adversarialAvailable && <AdversarialActions workbench={workbench} />}
                    {!editing && (
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Modelo da etapa atual e "Gerar prévia" (à esquerda); os botões ficam à direita. */}
                            <div className="mr-auto flex min-w-0 max-w-full items-center gap-3">
                                <WorkbenchModelSettings workbench={workbench} buttonClassName={ICON_BUTTON} />
                                {previewSwitchVisible(workbench.stage) && <Separator orientation="vertical" className="h-5" data-testid="workbench-actions-divider" />}
                                <PreviewSwitch workbench={workbench} rebuildAvailable={actions.includes("rebuild-preview")} actionPending={pending} onRebuild={() => run("rebuild-preview")} />
                            </div>
                            <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2">
                                {/* A prévia e o PR abrem pelos links do cabeçalho; "Gerar nova prévia" fica junto da chave. */}
                                {items.map((item) => (
                                    <WorkbenchActionButton key={item.id} item={item} reconnecting={autoReconnect.reconnecting} onSelect={select} />
                                ))}
                            </div>
                        </div>
                    )}
                    {!composer && actions.includes("reconnect") && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <PlugZap className="h-3.5 w-3.5" aria-hidden /> {RECONNECT_HINT}
                        </p>
                    )}
                </>
            )}

            <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirm === "interrupt" ? "Parar o agente?" : confirm === "cancel-wait" ? "Cancelar a espera por vaga?" : "Aprovar e abrir o PR?"}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirm === "interrupt"
                                ? "A etapa atual é interrompida no OpenCode. Depois você pode tentar de novo ou voltar ao planejamento."
                                : confirm === "cancel-wait"
                                  ? `"${slotQueue ? PENDING_TURN_LABELS[slotQueue.action] : ""}" não será executado e a mesa volta a aguardar sua ação nesta etapa.`
                                  : `O agente de PR vai validar, fazer commit e push da branch ${workbench.branch ?? ""} e ${workbench.pr?.state === "open" ? `atualizar o PR #${workbench.pr.number}` : "abrir o Pull Request"}.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (confirm) run(confirm)
                                setConfirm(null)
                            }}
                        >
                            {confirm === "interrupt" ? "Parar" : confirm === "cancel-wait" ? "Cancelar espera" : "Aprovar"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
