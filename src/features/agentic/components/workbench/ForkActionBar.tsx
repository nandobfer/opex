"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Combine, GitFork, Loader2, MessageSquareReply, RefreshCw, Send, Square, SquareCheck, Trash2 } from "lucide-react"
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
import { canOpenChildFork, forkActions } from "../../fork-logic"
import { useDiscardFork, useForkAction } from "../../hooks/useForks"
import type { ForkDto } from "../../types"
import { ForkComposer } from "./ForkComposer"

/**
 * Conversa e ciclo de vida do fork: enviar, encerrar, parar, tentar de novo, retomar, integrar,
 * descartar e **Abrir fork** a partir deste fork (fork de fork, com o fork em aberto).
 */
export function ForkActionBar({ workbenchId, fork, onForkOpened }: { workbenchId: string; fork: ForkDto; onForkOpened?: (fork: ForkDto) => void }) {
    const mutation = useForkAction(workbenchId, fork)
    const discard = useDiscardFork(workbenchId)
    const [text, setText] = useState("")
    const [confirm, setConfirm] = useState<"interrupt" | "discard" | null>(null)
    const [forking, setForking] = useState(false)
    const actions = forkActions(fork.status, fork.runState, Boolean(fork.summary)).filter((action) => !["apply", "revise-summary", "cancel-integration"].includes(action))
    const canFork = canOpenChildFork(fork.status)
    const pending = mutation.isPending || discard.isPending
    if (!actions.length && !canFork) return null
    const send = () => mutation.mutate({ action: "send", text: text.trim() }, { onSuccess: () => setText("") })

    if (forking)
        return (
            <div className="border-t p-3" data-ctrl-enter-scope>
                <AnimatePresence initial={false}>
                    <ForkComposer
                        key="fork-child-composer"
                        workbenchId={workbenchId}
                        parent={{ id: fork.id, number: fork.number }}
                        onCancel={() => setForking(false)}
                        onOpened={(child) => {
                            setForking(false)
                            onForkOpened?.(child)
                        }}
                    />
                </AnimatePresence>
            </div>
        )

    return (
        <div className="space-y-2 border-t p-3" data-ctrl-enter-scope>
            <AnimatePresence initial={false}>
                {actions.includes("send") && (
                    <motion.div key="fork-message" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                        <label htmlFor={`fork-message-${fork.id}`} className="sr-only">
                            Mensagem para o fork
                        </label>
                        <Textarea id={`fork-message-${fork.id}`} rows={3} value={text} onChange={(event) => setText(event.target.value)} placeholder="Continue a conversa do fork…" />
                    </motion.div>
                )}
                {fork.status === "closed" && (
                    <motion.p key="fork-closed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-muted-foreground">
                        Fork encerrado: retome a conversa, integre o que foi levantado à mesa ou descarte o fork.
                    </motion.p>
                )}
            </AnimatePresence>
            <div className="flex flex-wrap justify-end gap-2">
                {canFork && (
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={pending} onClick={() => setForking(true)}>
                        <GitFork className="h-3.5 w-3.5" aria-hidden /> Abrir fork
                    </Button>
                )}
                {actions.map((action) => {
                    switch (action) {
                        case "send":
                            return (
                                <Button key={action} type="button" data-ctrl-enter-submit size="sm" className="gap-1.5" disabled={pending || !text.trim()} onClick={send}>
                                    {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />} Enviar
                                </Button>
                            )
                        case "close":
                            return (
                                <Button key={action} type="button" variant="outline" size="sm" className="gap-1.5" disabled={pending} onClick={() => mutation.mutate({ action: "close" })}>
                                    <SquareCheck className="h-3.5 w-3.5" aria-hidden /> Encerrar fork
                                </Button>
                            )
                        case "interrupt":
                            return (
                                <Button key={action} type="button" variant="outline" size="sm" className="gap-1.5" disabled={pending} onClick={() => setConfirm("interrupt")}>
                                    <Square className="h-3.5 w-3.5" aria-hidden /> Parar
                                </Button>
                            )
                        case "retry":
                            return (
                                <Button key={action} type="button" size="sm" className="gap-1.5" disabled={pending} onClick={() => mutation.mutate({ action: "retry" })}>
                                    <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Tentar novamente
                                </Button>
                            )
                        case "resume":
                            return (
                                <Button key={action} type="button" variant="outline" size="sm" className="gap-1.5" disabled={pending} onClick={() => mutation.mutate({ action: "resume" })}>
                                    <MessageSquareReply className="h-3.5 w-3.5" aria-hidden /> Retomar conversa
                                </Button>
                            )
                        case "discard":
                            return (
                                <Button key={action} type="button" variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" disabled={pending} onClick={() => setConfirm("discard")}>
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Descartar fork
                                </Button>
                            )
                        case "integrate":
                            return (
                                <Button key={action} type="button" size="sm" className="gap-1.5" disabled={pending} onClick={() => mutation.mutate({ action: "integrate" })}>
                                    <Combine className="h-3.5 w-3.5" aria-hidden /> Integrar fork
                                </Button>
                            )
                        default:
                            return null
                    }
                })}
            </div>

            <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirm === "discard" ? `Descartar o fork ${fork.number}?` : "Parar o agente do fork?"}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirm === "discard"
                                ? "A conversa do fork, a saída e a sessão do OpenCode são apagadas e o fork fica inacessível. Esta ação não pode ser desfeita."
                                : "A resposta em andamento é interrompida. Depois você pode tentar de novo ou encerrar o fork."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (confirm === "discard") discard.mutate(fork)
                                else if (confirm === "interrupt") mutation.mutate({ action: "interrupt" })
                                setConfirm(null)
                            }}
                        >
                            {confirm === "discard" ? "Descartar" : "Parar"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
