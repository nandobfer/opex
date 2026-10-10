"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCheck, ExternalLink, GitPullRequest, Hammer, ListOrdered, Loader2, MessageSquareWarning, RefreshCw, RotateCcw, Send, Square, X } from "lucide-react"
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
import { useWorkbenchAction } from "../../hooks/useAgentic"
import { workbenchActions, type WorkbenchAction } from "../../logic"
import type { WorkbenchDto } from "../../types"

type FeedbackAction = Extract<WorkbenchAction, "revise-plan" | "request-correction" | "submit-pr-feedback" | "reopen">

const FEEDBACK: Record<FeedbackAction, { button: string; title: string; placeholder: string; submit: string }> = {
    "revise-plan": { button: "Solicitar correção do plano", title: "O que precisa mudar no plano?", placeholder: "Ex.: não altere o schema; use o componente X; inclua testes de Y…", submit: "Enviar ao planejador" },
    "request-correction": { button: "Solicitar correção", title: "O que está errado?", placeholder: "Descreva o que não funcionou ou precisa mudar. Vai para o planejador, que refaz o plano.", submit: "Enviar ao planejador" },
    "submit-pr-feedback": { button: "Descrever as mudanças", title: "O que a revisão do PR pediu?", placeholder: "A revisão pediu mudanças sem comentário: descreva o que precisa mudar.", submit: "Enviar ao planejador" },
    reopen: { button: "Reabrir mesa", title: "O que fazer agora?", placeholder: "Descreva o ajuste ou a continuação. Vai para o planejador.", submit: "Reabrir e planejar" },
}

const isFeedback = (action: WorkbenchAction): action is FeedbackAction => action in FEEDBACK

/** Botões da etapa atual; correções abrem o campo de texto que vai para o planejador. */
export function ActionBar({ workbench }: { workbench: WorkbenchDto }) {
    const mutation = useWorkbenchAction(workbench)
    const actions = workbenchActions(workbench.stage, workbench.runState, Boolean(workbench.previewUrl))
    const [composer, setComposer] = useState<FeedbackAction | null>(workbench.stage === "changes_requested" && workbench.runState === "idle" ? "submit-pr-feedback" : null)
    const [text, setText] = useState("")
    const [confirm, setConfirm] = useState<"interrupt" | "approve" | null>(null)
    const pending = mutation.isPending
    const run = (action: WorkbenchAction, body?: string) =>
        mutation.mutate(
            { action, text: body },
            {
                onSuccess: () => {
                    setComposer(null)
                    setText("")
                },
            },
        )
    const failed = workbench.runState === "failed" || workbench.runState === "interrupted"

    return (
        <div className="space-y-2 border-t p-3">
            <AnimatePresence initial={false}>
                {failed && workbench.error && (
                    <motion.p key="error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
                        {workbench.error}
                    </motion.p>
                )}
                {workbench.stage === "pr_open" && workbench.runState === "idle" && (
                    <motion.p key="watching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <GitPullRequest className="h-3.5 w-3.5" aria-hidden /> Acompanhando o PR a cada 2 minutos: pedido de mudanças volta ao planejamento; merge conclui a mesa e move a tarefa para Validação.
                    </motion.p>
                )}
                {workbench.stage === "build_queued" && (
                    <motion.p key="build-queue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ListOrdered className="h-3.5 w-3.5" aria-hidden /> Aguardando a vez do build{workbench.buildQueuePosition ? ` — posição #${workbench.buildQueuePosition}` : ""}. Um build por vez.
                    </motion.p>
                )}
                {composer && (
                    <motion.div key="composer" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="space-y-2 overflow-hidden">
                        <label htmlFor="workbench-feedback" className="text-sm font-medium">
                            {FEEDBACK[composer].title}
                        </label>
                        <Textarea id="workbench-feedback" autoFocus rows={4} value={text} onChange={(event) => setText(event.target.value)} placeholder={FEEDBACK[composer].placeholder} maxLength={8000} />
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setComposer(null)} disabled={pending}>
                                <X className="h-3.5 w-3.5" aria-hidden /> Cancelar
                            </Button>
                            <Button type="button" size="sm" className="gap-1.5" disabled={pending || text.trim().length < 3} onClick={() => run(composer, text.trim())}>
                                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
                                {FEEDBACK[composer].submit}
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {!composer && actions.length > 0 && (
                <div className="flex flex-wrap justify-end gap-2">
                    {actions.map((action) => {
                        if (isFeedback(action)) {
                            const label = action === "request-correction" && failed ? "Voltar ao planejamento" : FEEDBACK[action].button
                            return (
                                <Button key={action} type="button" variant="outline" size="sm" className="gap-1.5" disabled={pending} onClick={() => setComposer(action)}>
                                    {action === "reopen" ? <RotateCcw className="h-3.5 w-3.5" aria-hidden /> : <MessageSquareWarning className="h-3.5 w-3.5" aria-hidden />} {label}
                                </Button>
                            )
                        }
                        switch (action) {
                            case "open-preview":
                                return (
                                    <Button key={action} asChild variant="outline" size="sm" className="gap-1.5">
                                        <a href={workbench.previewUrl!} target="_blank" rel="noreferrer noopener">
                                            <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Abrir em nova guia
                                        </a>
                                    </Button>
                                )
                            case "implement":
                                return (
                                    <Button key={action} type="button" size="sm" className="gap-1.5" disabled={pending} onClick={() => run("implement")}>
                                        <Hammer className="h-3.5 w-3.5" aria-hidden /> Implementar
                                    </Button>
                                )
                            case "approve":
                                return (
                                    <Button key={action} type="button" size="sm" className="gap-1.5" disabled={pending} onClick={() => setConfirm("approve")}>
                                        <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Aprovar e abrir PR
                                    </Button>
                                )
                            case "retry":
                                return (
                                    <Button key={action} type="button" size="sm" className="gap-1.5" disabled={pending} onClick={() => run("retry")}>
                                        <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Tentar novamente
                                    </Button>
                                )
                            case "interrupt":
                                return (
                                    <Button key={action} type="button" variant="outline" size="sm" className="gap-1.5" disabled={pending} onClick={() => setConfirm("interrupt")}>
                                        <Square className="h-3.5 w-3.5" aria-hidden /> Parar
                                    </Button>
                                )
                            default:
                                return null
                        }
                    })}
                </div>
            )}

            <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirm === "interrupt" ? "Parar o agente?" : "Aprovar e abrir o PR?"}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirm === "interrupt"
                                ? "A etapa atual é interrompida no OpenCode. Depois você pode tentar de novo ou voltar ao planejamento."
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
                            {confirm === "interrupt" ? "Parar" : "Aprovar"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
