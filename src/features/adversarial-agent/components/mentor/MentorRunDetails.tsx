"use client"

import { AlertTriangle, Gavel, PenLine, Route, ShieldCheck, Zap } from "lucide-react"
import { MENTOR_LEVEL_DEFS, MENTOR_SOURCE_LABELS, MENTOR_TARGET_LABELS, MENTOR_USER_TRIGGER_LABELS } from "../../mentor/constants"
import type { MentorRunDto } from "../../mentor/types"
import { formatScore } from "./MentorRunBadge"
import { MentorRunChip, MentorRunReason, MentorRunSection } from "./MentorRunSection"

const WRITER_ACTION_LABELS: Record<NonNullable<MentorRunDto["writerAction"]>, string> = {
    create: "Criar uma memória nova",
    update: "Fundir com uma memória existente",
    skip: "Não gravar",
}

/** Etapas de uma execução do Mentor (Gatilhos, Decisor, Triador, Redator, Sanitizador e erro), em seções. */
export function MentorRunDetails({ run }: { run: MentorRunDto }) {
    return (
        <>
            {run.error && (
                <p role="alert" className="flex items-start gap-2 whitespace-pre-wrap break-words rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0">{run.error}</span>
                </p>
            )}
            <MentorRunSection icon={Zap} title="Gatilhos">
                <div className="flex flex-wrap gap-1.5">
                    {run.sources.map((source) => (
                        <MentorRunChip key={source}>{MENTOR_SOURCE_LABELS[source]}</MentorRunChip>
                    ))}
                    {run.trigger && <MentorRunChip>{MENTOR_USER_TRIGGER_LABELS[run.trigger].label}</MentorRunChip>}
                    {run.lessonCount > 0 && <MentorRunChip>{`Pedidos do desenvolvedor: ${run.lessonCount}`}</MentorRunChip>}
                </div>
                {run.userMessage && (
                    <blockquote aria-label="Mensagem" className="whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-sm leading-relaxed text-muted-foreground">
                        {run.userMessage}
                    </blockquote>
                )}
            </MentorRunSection>
            <MentorRunSection icon={Gavel} title="Decisor">
                <p className="font-medium">{`${MENTOR_LEVEL_DEFS[run.level].label} · ${formatScore(run.score, run.threshold)}`}</p>
                {run.deciderReason && <MentorRunReason>{run.deciderReason}</MentorRunReason>}
            </MentorRunSection>
            {run.target && (
                <MentorRunSection icon={Route} title="Triador">
                    <p className="font-medium">{`${MENTOR_TARGET_LABELS[run.target].label}${run.routerConfidence === null ? "" : ` · confiança ${Math.round(run.routerConfidence * 100)}%`}`}</p>
                    {run.routerReason && <MentorRunReason>{run.routerReason}</MentorRunReason>}
                </MentorRunSection>
            )}
            {run.writerAction && (
                <MentorRunSection icon={PenLine} title="Redator">
                    <p className="font-medium">{WRITER_ACTION_LABELS[run.writerAction]}</p>
                    {run.writerAction === "skip" && run.writerSkipKind && (
                        <p className="text-muted-foreground">
                            {run.writerSkipKind === "covered"
                                ? `Já coberta na lista de destino${run.writerCoveredBy ? ` (memória ${run.writerCoveredBy.memoryId})` : ""}.`
                                : "Sem lição reaproveitável nesta execução."}
                        </p>
                    )}
                    {run.writerReason && <MentorRunReason>{run.writerReason}</MentorRunReason>}
                    {run.skipRejection && (
                        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-muted-foreground">
                            Pedido de skip recusado: {run.skipRejection}
                        </p>
                    )}
                    {run.splitRejection && <p className="text-muted-foreground">Parte separada não gravada: {run.splitRejection}</p>}
                    {run.extraProposal && (
                        <p className="text-muted-foreground">
                            Parte separada: {MENTOR_TARGET_LABELS[run.extraProposal.target].label} ({run.extraProposal.action === "update" ? "fusão" : "nova"}).
                        </p>
                    )}
                </MentorRunSection>
            )}
            {run.sanitizerReason && (
                <MentorRunSection icon={ShieldCheck} title={run.status === "discarded" ? "Motivo do descarte" : "Sanitizador"}>
                    <MentorRunReason>{run.sanitizerReason}</MentorRunReason>
                </MentorRunSection>
            )}
        </>
    )
}
