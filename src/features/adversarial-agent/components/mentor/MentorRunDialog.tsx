"use client"

import { useState } from "react"
import { Check, Loader2, X } from "lucide-react"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog"
import { MEMORY_TEXT_MAX } from "@/features/ai/memory-text"
import type { MentorTarget } from "../../mentor/constants"
import type { MentorRunDto } from "../../mentor/types"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useMentorRun, useMentorRunDecision } from "../../hooks/useMentor"
import { MentorLearningRunBody } from "./MentorLearningRunBody"
import { MentorRunDetails } from "./MentorRunDetails"
import { MentorRunHeader } from "./MentorRunHeader"
import { MentorRunMemory } from "./MentorRunMemory"

/**
 * Detalhe de uma execução do Mentor (OPE-128): cabeçalho (código + situação, título, metadados) e o corpo.
 * No aprendizado na conclusão (OPE-165), o mesmo corpo da aba "Aprendizado" da mesa (casos e operações,
 * lidos ao abrir). Nas execuções antigas, as etapas em seções e a memória; numa sugestão antiga, Aprovar
 * (texto e destino editáveis) e Descartar; nos demais casos, Fechar.
 */
export function MentorRunDialog({ run, onClose }: { run: MentorRunDto | null; onClose: () => void }) {
    const decision = useMentorRunDecision()
    const [draft, setDraft] = useState<{ id: string; text: string } | null>(null)
    const [targetDraft, setTargetDraft] = useState<{ id: string; target: MentorTarget } | null>(null)
    const [confirmDiscard, setConfirmDiscard] = useState(false)
    const [extraDraft, setExtraDraft] = useState<{ id: string; text: string } | null>(null)
    const [excludeExtra, setExcludeExtra] = useState<{ id: string; value: boolean } | null>(null)
    const suggested = Boolean(run?.status === "suggested" && run.proposal)
    const text = run && draft?.id === run.id ? draft.text : (run?.proposal?.text ?? "")
    const target: MentorTarget = run && targetDraft?.id === run.id ? targetDraft.target : (run?.proposal?.target ?? "adversarial")
    const extraText = run && extraDraft?.id === run.id ? extraDraft.text : (run?.extraProposal?.text ?? "")
    const includeExtra = !(run && excludeExtra?.id === run.id && excludeExtra.value)
    const tooLong = text.length > MEMORY_TEXT_MAX || extraText.length > MEMORY_TEXT_MAX
    const decide = (kind: "approve" | "discard") => {
        if (!run) return
        decision.mutate(
            { id: run.id, decision: kind, ...(kind === "approve" ? { text, target, ...(run.extraProposal ? { extraText, includeExtra } : {}) } : {}) },
            { onSuccess: onClose },
        )
    }
    return (
        <Dialog open={run !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] flex-col gap-0 p-0 sm:max-w-2xl">
                <div className="border-b px-5 pb-4 pt-5 sm:px-6">
                    <MentorRunHeader run={run} />
                </div>
                {run?.kind === "learning" && (
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                        <LearningDetail id={run.id} />
                    </div>
                )}
                {run && run.kind !== "learning" && (
                    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-6">
                        <MentorRunDetails run={run} />
                        <MentorRunMemory
                            run={run}
                            editable={suggested}
                            text={text}
                            target={target}
                            onTextChange={(next) => setDraft({ id: run.id, text: next })}
                            onTargetChange={(next) => setTargetDraft({ id: run.id, target: next })}
                            {...(run.extraProposal
                                ? {
                                      extraText,
                                      onExtraTextChange: (next: string) => setExtraDraft({ id: run.id, text: next }),
                                      includeExtra,
                                      onIncludeExtraChange: (value: boolean) => setExcludeExtra({ id: run.id, value: !value }),
                                  }
                                : {})}
                        />
                    </div>
                )}
                <DialogFooter className="border-t px-5 py-3 sm:px-6">
                    {suggested ? (
                        <>
                            <Button type="button" variant="outline" className="gap-1.5" disabled={decision.isPending} onClick={() => setConfirmDiscard(true)}>
                                <X className="h-4 w-4" aria-hidden /> Descartar
                            </Button>
                            <Button type="button" className="gap-1.5" disabled={decision.isPending || tooLong || text.trim().length < 3} onClick={() => decide("approve")}>
                                {decision.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} Aprovar
                            </Button>
                        </>
                    ) : (
                        <DialogClose asChild>
                            <Button type="button" variant="outline">
                                Fechar
                            </Button>
                        </DialogClose>
                    )}
                </DialogFooter>
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

/** Aprendizado na conclusão: a execução com os casos, lida ao abrir. */
function LearningDetail({ id }: { id: string }) {
    const query = useMentorRun(id, true)
    if (query.isLoading) return <Skeleton className="h-64 w-full" />
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar a execução" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    return <MentorLearningRunBody run={query.data} />
}
