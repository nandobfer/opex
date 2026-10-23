"use client"

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
import { ReplyTextarea } from "@/components/agent-reply/ReplyTextarea"
import type { ForkIntegrationState } from "../../hooks/useForkIntegration"
import type { ForkDto } from "../../types"

/**
 * Corpo da integração do fork, no fim da conversa: o resumo consolidado pelo agente, o destino (fork
 * pai, contexto da conversa principal, planejador ou reabertura) e o campo de ajuste do Modificar.
 */
export function ForkIntegrationBody({ fork, state }: { fork: ForkDto; state: ForkIntegrationState }) {
    const { running, option, targets } = state
    return (
        <section className="space-y-3 rounded-r-md border-l-2 border-primary/60 bg-primary/5 py-2 pl-3 pr-2" aria-label={`Integrar a conversa · Fork ${fork.number}`}>
            <div>
                <h3 className="text-sm font-medium">Integrar a conversa · Fork {fork.number}</h3>
                <p className="mt-1 text-xs text-muted-foreground">Revise o resumo e escolha onde integrá-lo. A conversa original é preservada.</p>
            </div>
            <AnimatePresence mode="wait" initial={false}>
                {running || !fork.summary ? (
                    <motion.p key="summarizing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                        {running ? "O agente está consolidando o resumo do que foi levantado…" : "O resumo não foi gerado. Tente novamente ou cancele a integração."}
                    </motion.p>
                ) : (
                    <motion.div key={fork.summary} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-3">
                        <div className="text-sm [overflow-wrap:anywhere]" role="region" aria-label="Resumo da integração">
                            <Markdown>{fork.summary}</Markdown>
                        </div>
                        <div className="space-y-1.5">
                            <p id={`fork-target-${fork.id}`} className="text-xs font-medium">
                                Integrar em
                            </p>
                            <OptionTabs
                                aria-labelledby={`fork-target-${fork.id}`}
                                className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] [&>button]:min-w-0 [&>button]:whitespace-normal"
                                value={state.target}
                                onChange={state.setTarget}
                                options={targets.map((item) => ({ value: item.target, label: item.label, disabled: !item.available, title: `${item.label} — ${item.available ? item.description : (item.reason ?? item.description)}` }))}
                            />
                            <p className="text-xs text-muted-foreground">{option.available ? option.description : option.reason}</p>
                            {targets
                                .filter((item) => !item.available)
                                .map((item) => (
                                    <p key={item.target} className="text-xs text-muted-foreground">
                                        {item.label}: {item.reason ?? item.description}
                                    </p>
                                ))}
                        </div>
                        <AnimatePresence initial={false}>
                            {state.editing && (
                                <motion.div key="revise" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="space-y-1.5 overflow-hidden">
                                    <label htmlFor={`fork-revise-${fork.id}`} className="text-xs font-medium">
                                        O que mudar no resumo?
                                    </label>
                                    <ReplyTextarea id={`fork-revise-${fork.id}`} autoFocus rows={3} value={state.request} onValueChange={state.setRequest} placeholder="Ex.: inclua a decisão sobre X; remova a parte de Y…" />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    )
}

/** Botões da integração (na barra inferior do fork): Cancelar integração · Modificar resumo · Integrar, ou Voltar · Enviar ajuste. */
export function ForkIntegrationActions({ fork, state }: { fork: ForkDto; state: ForkIntegrationState }) {
    const { actions, editing, pending, option, target } = state
    return (
        <>
            {actions.includes("cancel-integration") && (
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" disabled={pending} onClick={editing ? state.stopEditing : state.cancel}>
                    <X className="h-3.5 w-3.5" aria-hidden /> {editing ? "Voltar" : "Cancelar integração"}
                </Button>
            )}
            {actions.includes("revise-summary") &&
                (editing ? (
                    <Button type="button" data-ctrl-enter-submit size="sm" className="gap-1.5" disabled={pending || state.request.trim().length < 3} onClick={state.revise}>
                        <Send className="h-3.5 w-3.5" aria-hidden /> Enviar ajuste
                    </Button>
                ) : (
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={pending} onClick={state.startEditing}>
                        <PencilLine className="h-3.5 w-3.5" aria-hidden /> Modificar resumo
                    </Button>
                ))}
            {actions.includes("apply") && !editing && (
                <Button type="button" size="sm" className="gap-1.5" disabled={pending || !option.available} onClick={() => (target === "reopen" ? state.setConfirmReopen(true) : state.apply())}>
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />} Integrar
                </Button>
            )}

            <AlertDialog open={state.confirmReopen} onOpenChange={state.setConfirmReopen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reabrir a mesa com o resumo?</AlertDialogTitle>
                        <AlertDialogDescription>A mesa concluída é reaberta e o planejador recebe o resumo do Fork {fork.number} para planejar de novo.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                state.apply()
                                state.setConfirmReopen(false)
                            }}
                        >
                            Reabrir e planejar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
