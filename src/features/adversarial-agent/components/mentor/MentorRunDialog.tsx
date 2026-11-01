"use client"

import { useState } from "react"
import { Check, Loader2, X } from "lucide-react"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Textarea } from "@/components/ui/textarea"
import { MEMORY_TEXT_MAX } from "@/features/ai/memory-text"
import { MENTOR_LEVEL_DEFS, MENTOR_SOURCE_LABELS, MENTOR_TARGET_LABELS, MENTOR_TARGETS, MENTOR_USER_TRIGGER_LABELS, type MentorTarget } from "../../mentor/constants"
import type { MentorRunDto } from "../../mentor/types"
import { useMentorRunDecision } from "../../hooks/useMentor"
import { formatCost, formatDuration } from "../ReviewBadges"
import { MentorRunBadge, formatScore } from "./MentorRunBadge"

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words text-sm">{children}</dd>
        </div>
    )
}

/** Linha do Triador: destino, confiança e motivo. */
function routerLine(run: MentorRunDto): string {
    if (!run.target) return ""
    const confidence = run.routerConfidence === null ? "" : ` · confiança ${Math.round(run.routerConfidence * 100)}%`
    return `${MENTOR_TARGET_LABELS[run.target].label}${confidence}${run.routerReason ? `\n${run.routerReason}` : ""}`
}

/** Detalhe de uma execução do Mentor; numa sugestão, Aprovar (com o texto e o destino editáveis) e Descartar. */
export function MentorRunDialog({ run, onClose }: { run: MentorRunDto | null; onClose: () => void }) {
    const decision = useMentorRunDecision()
    const [draft, setDraft] = useState<{ id: string; text: string } | null>(null)
    const [targetDraft, setTargetDraft] = useState<{ id: string; target: MentorTarget } | null>(null)
    const [confirmDiscard, setConfirmDiscard] = useState(false)
    const suggested = run?.status === "suggested" && run.proposal
    const text = run && draft?.id === run.id ? draft.text : (run?.proposal?.text ?? "")
    const target: MentorTarget = run && targetDraft?.id === run.id ? targetDraft.target : (run?.proposal?.target ?? "adversarial")
    const moved = Boolean(run?.proposal && target !== run.proposal.target)
    const tooLong = text.length > MEMORY_TEXT_MAX
    const decide = (kind: "approve" | "discard") => {
        if (!run) return
        decision.mutate({ id: run.id, decision: kind, ...(kind === "approve" ? { text, target } : {}) }, { onSuccess: onClose })
    }
    return (
        <Dialog open={run !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex flex-wrap items-center gap-2">
                        {run ? (
                            <>
                                {run.taskCode} · Agente Mentor <MentorRunBadge status={run.status} />
                            </>
                        ) : (
                            "Execução do Agente Mentor"
                        )}
                    </DialogTitle>
                    <DialogDescription>{run ? `${run.taskTitle} · ${formatCost(run.costUsd)} · ${formatDuration(run.durationMs)}` : null}</DialogDescription>
                </DialogHeader>
                {run && (
                    <dl className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                        <Row label="Gatilhos">{run.sources.map((source) => MENTOR_SOURCE_LABELS[source]).join(" · ")}</Row>
                        {run.trigger && <Row label="Tipo da mensagem">{MENTOR_USER_TRIGGER_LABELS[run.trigger].label}</Row>}
                        {run.userMessage && <Row label="Mensagem">{run.userMessage}</Row>}
                        {run.lessonCount > 0 && <Row label="Pedidos do desenvolvedor">{run.lessonCount}</Row>}
                        <Row label="Decisor">{`${MENTOR_LEVEL_DEFS[run.level].label} · ${formatScore(run.score, run.threshold)}${run.deciderReason ? `\n${run.deciderReason}` : ""}`}</Row>
                        {run.target && <Row label="Triador">{routerLine(run)}</Row>}
                        {run.writerAction && <Row label="Redator">{`${run.writerAction === "create" ? "Criar" : run.writerAction === "update" ? "Fundir com uma memória existente" : "Não gravar"}${run.writerReason ? `\n${run.writerReason}` : ""}`}</Row>}
                        {run.sanitizerReason && <Row label={run.status === "discarded" ? "Motivo do descarte" : "Sanitizador"}>{run.sanitizerReason}</Row>}
                        {run.error && <Row label="Erro">{run.error}</Row>}
                        {suggested && (
                            <Field id="mentor-run-target" label="Destino da memória">
                                <OptionTabs<MentorTarget>
                                    id="mentor-run-target"
                                    options={MENTOR_TARGETS.map((value) => ({ value, label: MENTOR_TARGET_LABELS[value].short }))}
                                    value={target}
                                    onChange={(next) => setTargetDraft({ id: run.id, target: next })}
                                    className="w-full flex-wrap"
                                />
                                {moved && run.proposal?.action === "update" && <p className="text-xs text-muted-foreground">Em outra lista, a fusão vira uma memória nova.</p>}
                            </Field>
                        )}
                        {suggested ? (
                            <Field id="mentor-run-text" label="Memória sugerida (pode editar antes de aprovar)" error={tooLong ? `Até ${MEMORY_TEXT_MAX.toLocaleString("pt-BR")} caracteres` : undefined}>
                                <Textarea id="mentor-run-text" rows={6} value={text} onChange={(event) => setDraft({ id: run.id, text: event.target.value })} />
                            </Field>
                        ) : (
                            run.proposal && <Row label={`Memória (${MENTOR_TARGET_LABELS[run.proposal.target].short})`}>{run.proposal.text}</Row>
                        )}
                    </dl>
                )}
                {suggested && (
                    <DialogFooter>
                        <Button type="button" variant="outline" className="gap-1.5" disabled={decision.isPending} onClick={() => setConfirmDiscard(true)}>
                            <X className="h-4 w-4" aria-hidden /> Descartar
                        </Button>
                        <Button type="button" className="gap-1.5" disabled={decision.isPending || tooLong || text.trim().length < 3} onClick={() => decide("approve")}>
                            {decision.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} Aprovar
                        </Button>
                    </DialogFooter>
                )}
                <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Descartar a sugestão?</AlertDialogTitle>
                            <AlertDialogDescription>Nenhuma memória será gravada a partir desta execução.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Voltar</AlertDialogCancel>
                            <Button
                                variant="destructive"
                                onClick={() => {
                                    setConfirmDiscard(false)
                                    decide("discard")
                                }}
                            >
                                Descartar
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </DialogContent>
        </Dialog>
    )
}
