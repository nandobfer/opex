"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { FastForward, Loader2, RefreshCw, ShieldAlert, Wrench } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ReplyTextarea } from "@/components/agent-reply/ReplyTextarea"
import { REPLY_PRIORITY } from "@/components/agent-reply/ReplyTargetProvider"
import { workbenchActions } from "@/features/agentic/logic"
import type { WorkbenchDto } from "@/features/agentic/types"
import { useAdversarialRealtime, useAdversarialWorkbenchAction, useWorkbenchAdversarialReview } from "../../hooks/useAdversarial"
import { findingsToFix } from "../../rounds"
import { sortFindings } from "../../verdict"
import { FindingList } from "../FindingList"

const ACTION_BUTTON = "gap-1.5 max-md:shrink-0 max-md:px-2.5"

/**
 * Decisões da mesa depois do agente adversário: no bloqueio, os achados (desmarque os que não
 * quer corrigir), a orientação opcional e Corrigir / Revisar de novo / Seguir mesmo assim; na revisão
 * que falhou, Seguir mesmo assim (Tentar novamente é o botão da mesa).
 */
export function AdversarialActions({ workbench }: { workbench: WorkbenchDto }) {
    const actions = workbenchActions(workbench.stage, workbench.runState, false, Boolean(workbench.sessionId), Boolean(workbench.slotQueue))
    const blocked = actions.includes("adversarial-fix")
    const canSkip = actions.includes("adversarial-skip")
    const review = useWorkbenchAdversarialReview(workbench.id, blocked)
    useAdversarialRealtime(blocked)
    const mutation = useAdversarialWorkbenchAction(workbench)
    const [excluded, setExcluded] = useState<string[]>([])
    const [text, setText] = useState("")
    const [confirmSkip, setConfirmSkip] = useState(false)
    if (!blocked && !canSkip) return null

    const latest = review.data
    const findings = latest ? sortFindings(latest.findings) : []
    const toFix = findingsToFix(findings, excluded)
    const pending = mutation.isPending
    const reset = () => {
        setExcluded([])
        setText("")
    }

    return (
        <div className="space-y-2">
            <AnimatePresence initial={false}>
                {blocked && (
                    <motion.div key="blocked" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="space-y-2 overflow-hidden">
                        <p className="flex items-start gap-2 text-sm text-amber-300">
                            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            {latest?.limitReached ? `O agente adversário ainda bloqueia e o limite de rodadas foi atingido (rodada ${latest.round}).` : `O agente adversário bloqueou a implementação${latest ? ` (rodada ${latest.round})` : ""}.`} Desmarque o que não quer corrigir.
                        </p>
                        {review.isLoading ? (
                            <Skeleton className="h-24 w-full" />
                        ) : (
                            <div className="max-h-64 overflow-y-auto pr-1">
                                <FindingList
                                    findings={findings}
                                    selectable={{
                                        excluded,
                                        disabled: pending,
                                        onToggle: (id, keep) => setExcluded((current) => (keep ? current.filter((item) => item !== id) : [...current, id])),
                                    }}
                                />
                            </div>
                        )}
                        <label htmlFor="adversarial-fix-text" className="text-sm font-medium">
                            Orientação ao implementador (opcional)
                        </label>
                        <ReplyTextarea id="adversarial-fix-text" rows={2} value={text} onValueChange={setText} replyPriority={REPLY_PRIORITY.extra} placeholder="Ex.: F2 é intencional; em F1, use o helper X…" />
                    </motion.div>
                )}
            </AnimatePresence>
            <div className="flex flex-wrap justify-end gap-2">
                {canSkip && (
                    <Button type="button" variant="outline" size="sm" className={ACTION_BUTTON} disabled={pending} onClick={() => setConfirmSkip(true)}>
                        <FastForward className="h-3.5 w-3.5" aria-hidden /> Seguir mesmo assim
                    </Button>
                )}
                {blocked && (
                    <>
                        <Button type="button" variant="outline" size="sm" className={ACTION_BUTTON} disabled={pending} onClick={() => mutation.mutate({ action: "adversarial-rerun" }, { onSuccess: reset })}>
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Revisar de novo
                        </Button>
                        <Button
                            type="button"
                            data-ctrl-enter-submit
                            size="sm"
                            className={ACTION_BUTTON}
                            disabled={pending || !latest || toFix.length === 0}
                            onClick={() => mutation.mutate({ action: "adversarial-fix", input: { text: text.trim() || undefined, excluded } }, { onSuccess: reset })}
                        >
                            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Wrench className="h-3.5 w-3.5" aria-hidden />}
                            Corrigir{toFix.length ? ` (${toFix.length})` : ""}
                        </Button>
                    </>
                )}
            </div>
            <AlertDialog open={confirmSkip} onOpenChange={setConfirmSkip}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Seguir sem o agente adversário?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {blocked ? "Os bloqueios apontados não serão corrigidos" : "A revisão que falhou não será refeita"} e a mesa segue para {workbench.agenticFlow === "auto_pr" ? "o Pull Request" : "a prévia"}.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => mutation.mutate({ action: "adversarial-skip" }, { onSuccess: reset })}>Seguir mesmo assim</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
