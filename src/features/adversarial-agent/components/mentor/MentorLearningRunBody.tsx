"use client"

import { AlertTriangle, FileText, Lightbulb, ListChecks } from "lucide-react"
import { EmptyState } from "@/components/feedback/EmptyState"
import { MENTOR_OPERATION_LABELS, MENTOR_OPERATIONS } from "../../mentor/constants"
import type { MentorLearningRunDto } from "../../mentor/types"
import { formatCost } from "../ReviewBadges"
import { MentorRetryButton } from "./MentorRetryButton"
import { MentorRunCases } from "./MentorRunCases"
import { MentorRunChip, MentorRunSection } from "./MentorRunSection"

const chars = (value: number) => `${value.toLocaleString("pt-BR")} caracteres`

/** Contagem das operações aplicadas (e das que falharam). */
export function MentorOperationChips({ counts }: { counts: MentorLearningRunDto["operationCounts"] }) {
    const items = [...MENTOR_OPERATIONS.map((op) => ({ key: op, label: MENTOR_OPERATION_LABELS[op], value: counts?.[op] ?? 0 })), { key: "failed", label: "Falharam", value: counts?.failed ?? 0 }].filter((item) => item.value > 0)
    if (!items.length) return <MentorRunChip>Nenhuma operação</MentorRunChip>
    return (
        <>
            {items.map((item) => (
                <MentorRunChip key={item.key}>{`${item.label}: ${item.value}`}</MentorRunChip>
            ))}
        </>
    )
}

/**
 * Corpo de uma execução de aprendizado (OPE-165), compartilhado pela aba "Aprendizado" da mesa e pelo
 * detalhe da página do Mentor: erro com Tentar novamente, a transcrição lida (tamanho e compactação), o
 * digestor, o custo contra o orçamento e os casos com as operações.
 */
export function MentorLearningRunBody({ run }: { run: MentorLearningRunDto }) {
    const running = run.status === "queued" || run.status === "running"
    return (
        <div className="space-y-5">
            {run.error && (
                <div role="alert" className="flex flex-wrap items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{run.error}</span>
                    {run.canRetry && <MentorRetryButton runId={run.id} />}
                </div>
            )}
            <MentorRunSection icon={FileText} title="Transcrição">
                {run.transcript ? (
                    <div className="flex flex-wrap gap-1.5" aria-label="Transcrição lida">
                        <MentorRunChip label="Tamanho da transcrição inteira">{chars(run.transcript.originalChars)}</MentorRunChip>
                        <MentorRunChip label="Tamanho enviado ao digestor">{run.transcript.compacted ? `compactada para ${chars(run.transcript.sentChars)} (nível ${run.transcript.level})` : "enviada inteira"}</MentorRunChip>
                        {run.transcript.aboveThreshold && <MentorRunChip>acima do limiar mesmo compactada</MentorRunChip>}
                        <MentorRunChip>{`${run.transcript.eventCount.toLocaleString("pt-BR")} eventos`}</MentorRunChip>
                        {run.transcript.forkCount > 0 && <MentorRunChip>{`${run.transcript.forkCount} ${run.transcript.forkCount === 1 ? "fork integrado" : "forks integrados"}`}</MentorRunChip>}
                    </div>
                ) : (
                    <p className="text-muted-foreground">{running ? "Lendo a transcrição…" : "A transcrição não foi lida."}</p>
                )}
            </MentorRunSection>
            <MentorRunSection icon={ListChecks} title="Digestor e custo">
                <div className="flex flex-wrap gap-1.5">
                    {run.digestModel && <MentorRunChip label="Modelo do digestor">{run.digestModel}</MentorRunChip>}
                    {run.caseCount !== null && <MentorRunChip>{`${run.caseCount} ${run.caseCount === 1 ? "caso" : "casos"}`}</MentorRunChip>}
                    {(run.digestDiscarded ?? 0) > 0 && <MentorRunChip label="Casos do digestor inválidos ou acima do teto técnico">{`${run.digestDiscarded} ${run.digestDiscarded === 1 ? "caso descartado" : "casos descartados"}`}</MentorRunChip>}
                    <MentorRunChip label="Custo da execução">{`${formatCost(run.costUsd)}${run.budgetUsd !== null ? ` de ${formatCost(run.budgetUsd)}` : ""}`}</MentorRunChip>
                    {run.abortReason === "budget" && <MentorRunChip>Interrompida pelo orçamento</MentorRunChip>}
                    <MentorOperationChips counts={run.operationCounts} />
                </div>
            </MentorRunSection>
            <MentorRunSection icon={Lightbulb} title="Casos">
                {run.cases.length ? (
                    <MentorRunCases cases={run.cases} />
                ) : (
                    <EmptyState icon={Lightbulb} title={running ? "Extraindo os casos…" : "Nenhum caso"} description={running ? "Os casos aparecem aqui assim que o digestor responder." : "O digestor não encontrou lições nesta mesa."} />
                )}
            </MentorRunSection>
        </div>
    )
}
