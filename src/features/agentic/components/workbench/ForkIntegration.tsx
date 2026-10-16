"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Loader2, PencilLine, Send, X } from "lucide-react"
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
import { Markdown } from "@/components/ui/markdown"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Textarea } from "@/components/ui/textarea"
import type { ForkIntegrationTarget } from "../../constants"
import { forkActions, forkIntegrationTargets, type ForkParentView } from "../../fork-logic"
import { useForkAction } from "../../hooks/useForks"
import type { ForkDto, WorkbenchDto } from "../../types"

/**
 * Integração do fork: o resumo consolidado pelo agente, o destino (fork pai, contexto da conversa
 * principal, planejador ou reabertura) e as decisões — Integrar, Modificar resumo ou Cancelar.
 */
export function ForkIntegration({ workbench, fork, parent = null }: { workbench: WorkbenchDto; fork: ForkDto; parent?: ForkParentView | null }) {
    const mutation = useForkAction(workbench.id, fork)
    const targets = forkIntegrationTargets({ stage: workbench.stage, runState: workbench.runState, sessionId: workbench.sessionId, waitingSlot: Boolean(workbench.slotQueue) }, parent)
    const firstAvailable = targets.find((item) => item.available)?.target ?? "context"
    const [chosen, setChosen] = useState<ForkIntegrationTarget | null>(null)
    const target = chosen && targets.find((item) => item.target === chosen)?.available ? chosen : firstAvailable
    const option = targets.find((item) => item.target === target)!
    const [editing, setEditing] = useState(false)
    const [request, setRequest] = useState("")
    const [confirm, setConfirm] = useState(false)
    const actions = forkActions(fork.status, fork.runState, Boolean(fork.summary))
    const pending = mutation.isPending
    const running = fork.runState === "running"
    const apply = () => mutation.mutate({ action: "apply", target })

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-primary/5" data-ctrl-enter-scope>
            <div className="shrink-0 border-b p-3">
                <h3 className="text-sm font-medium">Integrar a conversa · Fork {fork.number}</h3>
                <p className="mt-1 text-xs text-muted-foreground">Revise o resumo e escolha onde integrá-lo. A conversa original é preservada.</p>
            </div>
            <AnimatePresence mode="wait" initial={false}>
                {running || !fork.summary ? (
                    <motion.p key="summarizing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-0 flex-1 items-center justify-center gap-2 p-3 text-xs text-muted-foreground" role="status">
                        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                        {running ? "O agente está consolidando o resumo do que foi levantado…" : "O resumo não foi gerado. Tente novamente ou cancele a integração."}
                    </motion.p>
                ) : (
                    <motion.div key="summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="flex min-h-0 flex-1 flex-col">
                        <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-3 text-sm [overflow-wrap:anywhere]" role="region" aria-label="Resumo da integração" tabIndex={0}>
                            <Markdown>{fork.summary}</Markdown>
                        </div>
                        <div className="max-h-[50%] shrink-0 space-y-3 overflow-y-auto border-t bg-background/60 p-3">
                            <div className="space-y-1.5">
                                <p id={`fork-target-${fork.id}`} className="text-xs font-medium">Integrar em</p>
                                <OptionTabs
                                    aria-labelledby={`fork-target-${fork.id}`}
                                    className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] [&>button]:min-w-0 [&>button]:whitespace-normal"
                                    value={target}
                                    onChange={setChosen}
                                    options={targets.map((item) => ({ value: item.target, label: item.label, disabled: !item.available, title: `${item.label} — ${item.available ? item.description : (item.reason ?? item.description)}` }))}
                                />
                                <p className="text-xs text-muted-foreground">{option.available ? option.description : option.reason}</p>
                                {targets.filter((item) => !item.available).map((item) => <p key={item.target} className="text-xs text-muted-foreground">{item.label}: {item.reason ?? item.description}</p>)}
                            </div>
                            {editing && (
                                <div className="space-y-1.5">
                                    <label htmlFor={`fork-revise-${fork.id}`} className="text-xs font-medium">O que mudar no resumo?</label>
                                    <Textarea id={`fork-revise-${fork.id}`} autoFocus rows={3} value={request} onChange={(event) => setRequest(event.target.value)} placeholder="Ex.: inclua a decisão sobre X; remova a parte de Y…" />
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-background/60 p-3">
                {actions.includes("cancel-integration") && (
                    <Button type="button" variant="ghost" size="sm" className="gap-1.5" disabled={pending} onClick={() => (editing ? setEditing(false) : mutation.mutate({ action: "cancel-integration" }))}>
                        <X className="h-3.5 w-3.5" aria-hidden /> {editing ? "Voltar" : "Cancelar integração"}
                    </Button>
                )}
                {actions.includes("revise-summary") &&
                    (editing ? (
                        <Button
                            type="button"
                            data-ctrl-enter-submit
                            size="sm"
                            className="gap-1.5"
                            disabled={pending || request.trim().length < 3}
                            onClick={() =>
                                mutation.mutate(
                                    { action: "revise-summary", text: request.trim() },
                                    {
                                        onSuccess: () => {
                                            setEditing(false)
                                            setRequest("")
                                        },
                                    },
                                )
                            }
                        >
                            <Send className="h-3.5 w-3.5" aria-hidden /> Enviar ajuste
                        </Button>
                    ) : (
                        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={pending} onClick={() => setEditing(true)}>
                            <PencilLine className="h-3.5 w-3.5" aria-hidden /> Modificar resumo
                        </Button>
                    ))}
                {actions.includes("apply") && !editing && (
                    <Button type="button" size="sm" className="gap-1.5" disabled={pending || !option.available} onClick={() => (target === "reopen" ? setConfirm(true) : apply())}>
                        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />} Integrar
                    </Button>
                )}
            </div>

            <AlertDialog open={confirm} onOpenChange={setConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reabrir a mesa com o resumo?</AlertDialogTitle>
                        <AlertDialogDescription>A mesa concluída é reaberta e o planejador recebe o resumo do Fork {fork.number} para planejar de novo.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                apply()
                                setConfirm(false)
                            }}
                        >
                            Reabrir e planejar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
