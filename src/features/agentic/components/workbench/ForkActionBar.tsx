"use client"

import { useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Combine, GitFork, Loader2, MessageSquareReply, Pause, RefreshCw, Send, Square, Trash2 } from "lucide-react"
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
import { useFieldAttachments } from "../../hooks/useWorkbenchFiles"
import { AttachableTextarea } from "./AttachableTextarea"
import { canOpenChildFork, forkActions, isOpenFork } from "../../fork-logic"
import { useDiscardFork, useForkAction } from "../../hooks/useForks"
import type { ForkDto, WorkbenchDto } from "../../types"
import { ForkComposer } from "./ForkComposer"
import { ForkModeSelect } from "./ForkModeSelect"
import { LiveMessageComposer } from "./LiveMessageComposer"
import { ForkModelSettings } from "./ForkModelSettings"
import { cn } from "@/lib/utils"
import { useCompactWorkbench } from "../../hooks/useCompactWorkbench"
import { ForkMobileBar, type ForkButton } from "./mobile/ForkMobileBar"

/**
 * Conversa e ciclo de vida do fork: enviar, pausar a conversa, parar, tentar de novo, retomar, integrar,
 * descartar, **Modo** (Plan/Build e trava de somente leitura), **Modelos** (texto do modelo em uso e o popover "Modelos por etapa", com "Este fork" e as etapas da mesa) e **Abrir fork** a partir deste fork (fork
 * de fork, com o fork em aberto). `extra` entra na linha de botões depois do Abrir fork (ex.: os botões
 * da integração). Abaixo de `lg` (OPE-166) os botões viram o dock do celular (`ForkMobileBar`): o principal
 * (Enviar, Tentar novamente ou Integrar) e os demais, o Modo e os Modelos na folha "Mais ações".
 */
export function ForkActionBar({ workbenchId, workbench, fork, onForkOpened, extra = null }: { workbenchId: string; workbench?: WorkbenchDto; fork: ForkDto; onForkOpened?: (fork: ForkDto) => void; extra?: ReactNode }) {
    const compact = useCompactWorkbench()
    const mutation = useForkAction(workbenchId, fork)
    const discard = useDiscardFork(workbenchId)
    const [text, setText] = useState("")
    const attachments = useFieldAttachments(`fork:${fork.id}`)
    const blocked = attachments.blockReason
    const [confirm, setConfirm] = useState<"interrupt" | "discard" | null>(null)
    const [forking, setForking] = useState(false)
    const actions = forkActions(fork.status, fork.runState, Boolean(fork.summary)).filter((action) => !["apply", "revise-summary", "cancel-integration"].includes(action))
    const canFork = canOpenChildFork(fork.status)
    const pending = mutation.isPending || discard.isPending
    // Chat durante a execução: com o agente respondendo no fork ativo, a mensagem entra no turno atual.
    const live = fork.liveChat && fork.runState === "running" && fork.status === "active"
    if (!actions.length && !canFork && !extra) return null
    const send = (value = text.trim()) =>
        mutation.mutate(
            { action: "send", text: value, ...(attachments.fileIds.length ? { fileIds: attachments.fileIds } : {}) },
            {
                onSuccess: () => {
                    setText("")
                    attachments.clearSent()
                },
            },
        )

    const buttons: ForkButton[] = actions.flatMap((action): ForkButton[] => {
        switch (action) {
            case "send":
                return [{ key: action, label: "Enviar", icon: Send, variant: "default", disabled: pending || !text.trim() || Boolean(blocked), title: blocked, ctrlEnter: true, spinning: mutation.isPending, onSelect: () => send() }]
            case "close":
                return [{ key: action, label: "Pausar conversa", icon: Pause, variant: "outline", disabled: pending, onSelect: () => mutation.mutate({ action: "close" }) }]
            case "interrupt":
                return [{ key: action, label: "Parar", icon: Square, variant: "outline", disabled: pending, onSelect: () => setConfirm("interrupt") }]
            case "retry":
                return [{ key: action, label: "Tentar novamente", icon: RefreshCw, variant: "default", disabled: pending, onSelect: () => mutation.mutate({ action: "retry" }) }]
            case "resume":
                return [{ key: action, label: "Retomar conversa", icon: MessageSquareReply, variant: "outline", disabled: pending, onSelect: () => mutation.mutate({ action: "resume" }) }]
            case "discard":
                return [{ key: action, label: "Descartar fork", icon: Trash2, variant: "outline", destructive: true, disabled: pending, onSelect: () => setConfirm("discard") }]
            case "integrate":
                return [{ key: action, label: "Integrar fork", icon: Combine, variant: "default", disabled: pending, onSelect: () => mutation.mutate({ action: "integrate" }) }]
            default:
                return []
        }
    })

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
                {live && <LiveMessageComposer key="fork-live-message" id={`fork-live-message-${fork.id}`} value={text} onValueChange={setText} attachments={attachments} pending={mutation.isPending} compact={compact} onSubmit={send} />}
                {actions.includes("send") && (
                    <motion.div key="fork-message" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                        <label htmlFor={`fork-message-${fork.id}`} className="sr-only">
                            Mensagem para o fork
                        </label>
                        <AttachableTextarea id={`fork-message-${fork.id}`} rows={compact ? 2 : 3} value={text} onValueChange={setText} placeholder="Continue a conversa do fork…" attachments={attachments} />
                    </motion.div>
                )}
                {fork.status === "closed" && (
                    <motion.p key="fork-closed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-muted-foreground">
                        Conversa pausada: retome a conversa, integre o que foi levantado à mesa ou descarte o fork.
                    </motion.p>
                )}
            </AnimatePresence>
            {compact ? (
                <>
                    {extra && <div className="flex flex-wrap items-center justify-end gap-2">{extra}</div>}
                    <ForkMobileBar
                        fork={fork}
                        workbench={workbench}
                        buttons={buttons}
                        canFork={canFork}
                        pending={pending}
                        onFork={() => setForking(true)}
                        onMode={(mode) => mutation.mutate({ action: "set-mode", mode })}
                        onLock={() => mutation.mutate({ action: "lock" })}
                    />
                </>
            ) : (
                <div className="flex flex-wrap items-center justify-end gap-2">
                    {isOpenFork(fork.status) && (
                        <div className="mr-auto flex min-w-0 flex-wrap items-center gap-2">
                            <ForkModeSelect fork={fork} disabled={pending} onChange={(mode) => mutation.mutate({ action: "set-mode", mode })} onLock={() => mutation.mutate({ action: "lock" })} />
                            {workbench && <ForkModelSettings workbench={workbench} fork={fork} buttonClassName="h-8 min-w-8 px-2" />}
                        </div>
                    )}
                    {canFork && (
                        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={pending} onClick={() => setForking(true)}>
                            <GitFork className="h-3.5 w-3.5" aria-hidden /> Abrir fork
                        </Button>
                    )}
                    {extra}
                    {buttons.map((button) => (
                        <Button
                            key={button.key}
                            type="button"
                            variant={button.variant}
                            size="sm"
                            data-ctrl-enter-submit={button.ctrlEnter || undefined}
                            className={cn("gap-1.5", button.destructive && "text-destructive hover:text-destructive")}
                            disabled={button.disabled}
                            title={button.title ?? undefined}
                            onClick={button.onSelect}
                        >
                            {button.spinning ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <button.icon className="h-3.5 w-3.5" aria-hidden />} {button.label}
                        </Button>
                    ))}
                </div>
            )}

            <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirm === "discard" ? `Descartar o fork ${fork.number}?` : "Parar o agente do fork?"}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirm === "discard"
                                ? "A conversa do fork, a saída e a sessão do OpenCode são apagadas e o fork fica inacessível. Esta ação não pode ser desfeita."
                                : "A resposta em andamento é interrompida. Depois você pode tentar de novo ou pausar a conversa."}
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
