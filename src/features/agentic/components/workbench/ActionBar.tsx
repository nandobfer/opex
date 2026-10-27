"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCheck, GitFork, GitPullRequest, Hammer, Hourglass, ListOrdered, Loader2, MessageSquareWarning, PlugZap, RefreshCw, RotateCcw, Send, Square, X } from "lucide-react"
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
import { Separator } from "@/components/ui/separator"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { ReplyTextarea } from "@/components/agent-reply/ReplyTextarea"
import { REPLY_PRIORITY, useReplyFallback } from "@/components/agent-reply/ReplyTargetProvider"
import { insertQuote } from "@/lib/markdown/quote"
import { useSendWorkbenchLiveMessage, useWorkbenchAction, useWorkbenchReconnect } from "../../hooks/useAgentic"
import { workbenchActions, type WorkbenchAction } from "../../logic"
import type { ForkDto, WorkbenchDto } from "../../types"
import { PENDING_TURN_LABELS } from "../../constants"
import { ForkComposer } from "./ForkComposer"
import { LiveMessageComposer } from "./LiveMessageComposer"
import { useAutoReconnect } from "../../hooks/useAutoReconnect"
import { ReconnectButton } from "./ReconnectButton"
import { PreviewSwitch, previewSwitchVisible } from "./PreviewSwitch"
import { WorkbenchModelPicker } from "./WorkbenchModelPicker"

type FeedbackAction = Extract<WorkbenchAction, "revise-plan" | "request-correction" | "submit-pr-feedback" | "reopen">

const FEEDBACK: Record<FeedbackAction, { button: string; title: string; placeholder: string; submit: string }> = {
    "revise-plan": { button: "Solicitar correção do plano", title: "O que precisa mudar no plano?", placeholder: "Ex.: não altere o schema; use o componente X; inclua testes de Y…", submit: "Enviar ao planejador" },
    "request-correction": { button: "Solicitar correção", title: "O que está errado?", placeholder: "Descreva o que não funcionou ou precisa mudar. Vai para o planejador, que refaz o plano.", submit: "Enviar ao planejador" },
    "submit-pr-feedback": { button: "Descrever as mudanças", title: "O que o PR pediu?", placeholder: "O PR pediu mudanças sem comentário: descreva o que precisa mudar.", submit: "Enviar ao planejador" },
    reopen: { button: "Reabrir mesa", title: "O que fazer agora?", placeholder: "Descreva o ajuste ou a continuação. Vai para o planejador.", submit: "Reabrir e planejar" },
}

const isFeedback = (action: WorkbenchAction): action is FeedbackAction => action in FEEDBACK

/** Correções viram botão de ícone com dica; as demais (`submit-pr-feedback`, `reopen`) mantêm o texto. */
type CorrectionAction = Extract<FeedbackAction, "revise-plan" | "request-correction">

const isCorrection = (action: FeedbackAction): action is CorrectionAction => action === "revise-plan" || action === "request-correction"

const CORRECTION_TOOLTIP: Record<CorrectionAction, string> = {
    "revise-plan": "Pedir mudanças no plano ao planejador",
    "request-correction": "Descrever o que está errado; vai para o planejador",
}

/** Rótulo compacto (celular) dos feedbacks com texto; o nome acessível completo vai no `aria-label`. */
const COMPACT_LABEL: Record<Exclude<FeedbackAction, CorrectionAction>, string> = {
    "submit-pr-feedback": "Descrever",
    reopen: "Reabrir",
}

/** Botão de ícone da barra: mesma altura dos botões `size="sm"`. */
const ICON_BUTTON = "h-8 min-w-8 px-2 max-md:shrink-0"

/** Bloqueio dos botões de ícone enquanto outra ação da mesa está em andamento. */
const PENDING_REASON = "Aguarde a ação em andamento"

/** Botões das etapas: no celular não encolhem nem ganham padding grande (cabe tudo na mesma linha). */
const ACTION_BUTTON = "gap-1.5 max-md:shrink-0 max-md:px-2.5"

/** Rótulo completo no desktop; compacto no celular (`< md`). */
function ActionLabel({ full, compact }: { full: string; compact: string }) {
    return (
        <>
            <span className="max-md:hidden">{full}</span>
            <span className="md:hidden">{compact}</span>
        </>
    )
}

/** Botões da etapa atual; correções abrem o campo de texto que vai para o planejador. */
export function ActionBar({ workbench, onForkOpened }: { workbench: WorkbenchDto; onForkOpened?: (fork: ForkDto) => void }) {
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
    const liveChat = workbench.liveChat && workbench.runState === "running" && !slotQueue && !workbench.deletionRequestedAt
    const pending = mutation.isPending
    const run = (action: WorkbenchAction, body?: string) =>
        mutation.mutate(
            { action, text: body },
            {
                onSuccess: () => {
                    setComposer(null)
                    setText("")
                    setAdditional("")
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

    return (
        <div className="space-y-2 border-t p-3" data-ctrl-enter-scope>
            <AnimatePresence initial={false}>
                {failed && workbench.error && (
                    <motion.p key="error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
                        {workbench.error}
                    </motion.p>
                )}
                {autoReconnect.notice && (
                    <motion.p key="reconnect-notice" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                        <PlugZap className="h-3.5 w-3.5" aria-hidden /> {autoReconnect.notice}
                    </motion.p>
                )}
                {slotQueue && (
                    <motion.p key="slot-queue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                        <Hourglass className="h-3.5 w-3.5 shrink-0" aria-hidden /> Aguardando vaga na central{slotQueue.position ? ` — posição #${slotQueue.position}` : ""}: {PENDING_TURN_LABELS[slotQueue.action]}.
                    </motion.p>
                )}
                {!slotQueue && workbench.stage === "pr_open" && workbench.runState === "idle" && (
                    <motion.p key="watching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <GitPullRequest className="h-3.5 w-3.5" aria-hidden /> Acompanhando o PR a cada 2 minutos: um comentário com @opex ou um pedido de mudanças volta ao planejamento; CI falho é corrigido pelo agente (quando a central permite); merge conclui a mesa e move a tarefa para Validação.
                    </motion.p>
                )}
                {workbench.stage === "resolving_conflicts" && workbench.runState === "running" && (
                    <motion.p key="conflicts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <GitPullRequest className="h-3.5 w-3.5" aria-hidden /> O PR está com o merge bloqueado por conflito: o agente está integrando a branch de destino, resolvendo os conflitos e atualizando o PR. Você pode parar a qualquer momento.
                    </motion.p>
                )}
                {workbench.stage === "fixing_ci" && workbench.runState === "running" && (
                    <motion.p key="fixing-ci" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <GitPullRequest className="h-3.5 w-3.5" aria-hidden /> O CI do PR falhou: o agente está lendo os logs, corrigindo a branch do PR e enviando a correção (push). Você pode parar a qualquer momento.
                    </motion.p>
                )}
                {workbench.stage === "merging_pr" && workbench.runState === "running" && (
                    <motion.p key="merging" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <GitPullRequest className="h-3.5 w-3.5" aria-hidden /> Merge automático ligado: o agente está mergeando o PR (preservando o histórico). Se o GitHub recusar por bloqueios, a mesa avisa e você decide.
                    </motion.p>
                )}
                {workbench.stage === "deleting_pr_branch" && workbench.runState === "running" && (
                    <motion.p key="deleting-branch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <GitPullRequest className="h-3.5 w-3.5" aria-hidden /> O PR foi mergeado: o agente está apagando a branch remota de origem.
                    </motion.p>
                )}
                {workbench.stage === "build_queued" && (
                    <motion.p key="build-queue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ListOrdered className="h-3.5 w-3.5" aria-hidden /> Aguardando a vez do build{workbench.buildQueuePosition ? ` — posição #${workbench.buildQueuePosition}` : ""}. Um build por vez.
                    </motion.p>
                )}
                {!composer && !forking && canImplement && (
                    <motion.div key="implement-info" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="space-y-1.5 overflow-hidden">
                        <label htmlFor="workbench-implement-info" className="text-sm font-medium">
                            Informações adicionais (opcional)
                        </label>
                        <ReplyTextarea id="workbench-implement-info" rows={3} value={additional} onValueChange={setAdditional} replyPriority={REPLY_PRIORITY.extra} placeholder="Ex.: regras de negócio, decisões, links, o que evitar…" />
                        <p className="text-xs text-muted-foreground">Essas informações são enviadas ao agente junto do plano aprovado, no prompt de implementação.</p>
                    </motion.div>
                )}
                {composer && (
                    <motion.div key="composer" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="space-y-2 overflow-hidden">
                        <label htmlFor="workbench-feedback" className="text-sm font-medium">
                            {FEEDBACK[composer].title}
                        </label>
                        <ReplyTextarea id="workbench-feedback" autoFocus rows={4} value={text} onValueChange={setText} placeholder={FEEDBACK[composer].placeholder} />
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setComposer(null)} disabled={pending}>
                                <X className="h-3.5 w-3.5" aria-hidden /> Cancelar
                            </Button>
                            <Button type="button" data-ctrl-enter-submit size="sm" className="gap-1.5" disabled={pending || text.trim().length < 3} onClick={() => run(composer, text.trim())}>
                                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
                                {FEEDBACK[composer].submit}
                            </Button>
                        </div>
                    </motion.div>
                )}
                {liveChat && !composer && !forking && (
                    <LiveMessageComposer key="live-message" id="workbench-live-message" value={liveText} onValueChange={setLiveText} pending={liveMessage.isPending} onSubmit={(value) => liveMessage.mutate(value, { onSuccess: () => setLiveText("") })} />
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

            {!composer && !forking && (
                <div className="flex flex-wrap items-center gap-2">
                    {/* Modelo da etapa atual e "Gerar prévia" (à esquerda); os botões ficam à direita. */}
                    <div className="mr-auto flex min-w-0 max-w-full items-center gap-3">
                        <WorkbenchModelPicker workbench={workbench} />
                        {previewSwitchVisible(workbench.stage) && <Separator orientation="vertical" className="h-5" data-testid="workbench-actions-divider" />}
                        <PreviewSwitch workbench={workbench} />
                    </div>
                    <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2 max-md:max-w-full max-md:flex-nowrap max-md:gap-1.5 max-md:overflow-x-auto max-md:pb-0.5">
                        {/* A prévia e o PR abrem pelos links do cabeçalho. */}
                        <TooltipIconButton
                            label="Abrir fork"
                            tooltip="Abrir fork da conversa (perguntar ou investigar sem alterar a mesa)"
                            disabledReason={workbench.deletionRequestedAt ? "A mesa está sendo excluída" : null}
                            className={ICON_BUTTON}
                            onClick={() => setForking(true)}
                        >
                            <GitFork aria-hidden />
                        </TooltipIconButton>
                        {actions.filter((action) => action !== "open-preview").map((action) => {
                            if (isFeedback(action)) {
                                if (isCorrection(action)) {
                                    const replan = action === "request-correction" && failed
                                    return (
                                        <TooltipIconButton
                                            key={action}
                                            label={replan ? "Voltar ao planejamento" : FEEDBACK[action].button}
                                            tooltip={replan ? "Voltar ao planejamento com uma correção" : CORRECTION_TOOLTIP[action]}
                                            disabledReason={pending ? PENDING_REASON : null}
                                            className={ICON_BUTTON}
                                            onClick={() => setComposer(action)}
                                        >
                                            <MessageSquareWarning aria-hidden />
                                        </TooltipIconButton>
                                    )
                                }
                                const label = FEEDBACK[action].button
                                const compact = COMPACT_LABEL[action]
                                return (
                                    <Button key={action} type="button" variant="outline" size="sm" className={ACTION_BUTTON} disabled={pending} aria-label={label} onClick={() => setComposer(action)}>
                                        {action === "reopen" ? <RotateCcw className="h-3.5 w-3.5" aria-hidden /> : <MessageSquareWarning className="h-3.5 w-3.5" aria-hidden />}
                                        <ActionLabel full={label} compact={compact} />
                                    </Button>
                                )
                            }
                            switch (action) {
                                case "implement":
                                    return (
                                        <Button key={action} type="button" data-ctrl-enter-submit size="sm" className={ACTION_BUTTON} disabled={pending} onClick={() => run("implement", additional.trim() || undefined)}>
                                            <Hammer className="h-3.5 w-3.5" aria-hidden /> Implementar
                                        </Button>
                                    )
                                case "approve": {
                                    // Com PR aberto, aprovar só atualiza o PR existente.
                                    const prOpen = workbench.pr?.state === "open"
                                    const label = prOpen ? "Aprovar" : "Aprovar e abrir PR"
                                    return (
                                        <Button key={action} type="button" size="sm" className={ACTION_BUTTON} disabled={pending} aria-label={label} onClick={() => setConfirm("approve")}>
                                            <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                                            <ActionLabel full={label} compact={prOpen ? "Aprovar" : "Aprovar PR"} />
                                        </Button>
                                    )
                                }
                                case "reconnect":
                                    return <ReconnectButton key={action} reconnecting={autoReconnect.reconnecting} className={ACTION_BUTTON} onClick={autoReconnect.retryNow} />
                                case "retry":
                                    return (
                                        <Button key={action} type="button" size="sm" className={ACTION_BUTTON} disabled={pending} aria-label="Tentar novamente" onClick={() => run("retry")}>
                                            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                                            <ActionLabel full="Tentar novamente" compact="Tentar" />
                                        </Button>
                                    )
                                case "cancel-wait":
                                    return (
                                        <Button key={action} type="button" variant="outline" size="sm" className={ACTION_BUTTON} disabled={pending} aria-label="Cancelar espera" onClick={() => setConfirm("cancel-wait")}>
                                            <X className="h-3.5 w-3.5" aria-hidden />
                                            <ActionLabel full="Cancelar espera" compact="Cancelar" />
                                        </Button>
                                    )
                                case "interrupt":
                                    return (
                                        <Button key={action} type="button" variant="outline" size="sm" className={ACTION_BUTTON} disabled={pending} onClick={() => setConfirm("interrupt")}>
                                            <Square className="h-3.5 w-3.5" aria-hidden /> Parar
                                        </Button>
                                    )
                                default:
                                    return null
                            }
                        })}
                    </div>
                </div>
            )}

            {!composer && actions.includes("reconnect") && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <PlugZap className="h-3.5 w-3.5" aria-hidden /> Reconectar acompanha a sessão existente sem reenviar a mensagem (use se o agente ainda estiver rodando).
                </p>
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
