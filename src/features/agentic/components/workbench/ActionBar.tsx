"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCheck, ExternalLink, GitFork, GitPullRequest, Hammer, Hourglass, ListOrdered, Loader2, MessageSquareWarning, PlugZap, RefreshCw, RotateCcw, Send, Square, X } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import { useWorkbenchAction, useWorkbenchReconnect } from "../../hooks/useAgentic"
import { workbenchActions, type WorkbenchAction } from "../../logic"
import type { ForkDto, WorkbenchDto } from "../../types"
import { PENDING_TURN_LABELS } from "../../constants"
import { ForkComposer } from "./ForkComposer"
import { useAutoReconnect } from "../../hooks/useAutoReconnect"
import { ReconnectButton } from "./ReconnectButton"

type FeedbackAction = Extract<WorkbenchAction, "revise-plan" | "request-correction" | "submit-pr-feedback" | "reopen">

const FEEDBACK: Record<FeedbackAction, { button: string; title: string; placeholder: string; submit: string }> = {
    "revise-plan": { button: "Solicitar correção do plano", title: "O que precisa mudar no plano?", placeholder: "Ex.: não altere o schema; use o componente X; inclua testes de Y…", submit: "Enviar ao planejador" },
    "request-correction": { button: "Solicitar correção", title: "O que está errado?", placeholder: "Descreva o que não funcionou ou precisa mudar. Vai para o planejador, que refaz o plano.", submit: "Enviar ao planejador" },
    "submit-pr-feedback": { button: "Descrever as mudanças", title: "O que o PR pediu?", placeholder: "O PR pediu mudanças sem comentário: descreva o que precisa mudar.", submit: "Enviar ao planejador" },
    reopen: { button: "Reabrir mesa", title: "O que fazer agora?", placeholder: "Descreva o ajuste ou a continuação. Vai para o planejador.", submit: "Reabrir e planejar" },
}

const isFeedback = (action: WorkbenchAction): action is FeedbackAction => action in FEEDBACK

/** Rótulo compacto (celular) de `FeedbackAction`; o nome acessível completo vai no `aria-label`. */
const COMPACT_LABEL: Record<FeedbackAction, string> = {
    "revise-plan": "Correção",
    "request-correction": "Correção",
    "submit-pr-feedback": "Descrever",
    reopen: "Reabrir",
}

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
                        <GitPullRequest className="h-3.5 w-3.5" aria-hidden /> Acompanhando o PR a cada 2 minutos: um comentário com @opex ou um pedido de mudanças volta ao planejamento; merge conclui a mesa e move a tarefa para Validação.
                    </motion.p>
                )}
                {workbench.stage === "resolving_conflicts" && workbench.runState === "running" && (
                    <motion.p key="conflicts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <GitPullRequest className="h-3.5 w-3.5" aria-hidden /> O PR está com o merge bloqueado por conflito: o agente está integrando a branch de destino, resolvendo os conflitos e atualizando o PR. Você pode parar a qualquer momento.
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
                        <Textarea id="workbench-implement-info" rows={3} value={additional} onChange={(event) => setAdditional(event.target.value)} placeholder="Ex.: regras de negócio, decisões, links, o que evitar…" />
                        <p className="text-xs text-muted-foreground">Essas informações são enviadas ao agente junto do plano aprovado, no prompt de implementação.</p>
                    </motion.div>
                )}
                {composer && (
                    <motion.div key="composer" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="space-y-2 overflow-hidden">
                        <label htmlFor="workbench-feedback" className="text-sm font-medium">
                            {FEEDBACK[composer].title}
                        </label>
                        <Textarea id="workbench-feedback" autoFocus rows={4} value={text} onChange={(event) => setText(event.target.value)} placeholder={FEEDBACK[composer].placeholder} />
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
                <div className="flex flex-wrap justify-end gap-2 max-md:flex-nowrap max-md:gap-1.5 max-md:overflow-x-auto max-md:pb-0.5">
                    {/* Abrir em nova guia (prévia) é sempre o primeiro da linha. */}
                    {actions.includes("open-preview") && (
                        <Button asChild variant="outline" size="sm" className={ACTION_BUTTON}>
                            <a href={workbench.previewUrl!} target="_blank" rel="noreferrer noopener" aria-label="Abrir em nova guia" title="Abrir em nova guia">
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                <span className="max-md:hidden">Abrir em nova guia</span>
                            </a>
                        </Button>
                    )}
                    {workbench.pr && (
                        <Button asChild variant="outline" size="sm" className={ACTION_BUTTON}>
                            <a href={workbench.pr.url} target="_blank" rel="noreferrer noopener">
                                <GitPullRequest className="h-3.5 w-3.5" aria-hidden /> Ver PR #{workbench.pr.number}
                            </a>
                        </Button>
                    )}
                    <Button type="button" variant="outline" size="sm" className={ACTION_BUTTON} disabled={Boolean(workbench.deletionRequestedAt)} onClick={() => setForking(true)}>
                        <GitFork className="h-3.5 w-3.5" aria-hidden /> Abrir fork
                    </Button>
                    {actions.map((action) => {
                        if (isFeedback(action)) {
                            const label = action === "request-correction" && failed ? "Voltar ao planejamento" : FEEDBACK[action].button
                            const compact = action === "request-correction" && failed ? "Replanejar" : COMPACT_LABEL[action]
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
                            case "approve":
                                return (
                                    <Button key={action} type="button" size="sm" className={ACTION_BUTTON} disabled={pending} aria-label="Aprovar e abrir PR" onClick={() => setConfirm("approve")}>
                                        <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                                        <ActionLabel full="Aprovar e abrir PR" compact="Aprovar PR" />
                                    </Button>
                                )
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
                                    <Button key={action} type="button" variant="outline" size="sm" className="gap-1.5" disabled={pending} onClick={() => setConfirm("cancel-wait")}>
                                        <X className="h-3.5 w-3.5" aria-hidden /> Cancelar espera
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
