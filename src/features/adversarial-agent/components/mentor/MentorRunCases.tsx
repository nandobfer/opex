"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Lightbulb } from "lucide-react"
import { cn } from "@/lib/utils"
import { listItem } from "@/components/motion/presets"
import { MENTOR_CASE_STATUS_LABELS, MENTOR_TARGET_LABELS, type MentorCaseStatus } from "../../mentor/constants"
import { MENTOR_CASE_NATURE_LABELS, MENTOR_CASE_SCOPE_LABELS, type MentorCaseNature, type MentorCaseScope } from "../../mentor/digest"
import type { MentorRunCaseDto } from "../../mentor/types"
import { MentorRunChip, MentorRunReason } from "./MentorRunSection"
import { MentorRunOperation } from "./MentorRunOperation"

const TONE: Record<MentorCaseStatus, string> = {
    pending: "bg-muted text-muted-foreground",
    skipped: "bg-muted text-muted-foreground",
    discarded: "bg-muted text-muted-foreground",
    applied: "bg-emerald-500/15 text-emerald-300",
    partial: "bg-amber-500/15 text-amber-300",
    failed: "bg-destructive/15 text-destructive",
}

const percent = (value: number) => `${Math.round(value * 100)}%`

/** Por que o caso não virou operação (decisor, cobertura, sem lição ou recusa do sanitizador). */
function caseOutcome(item: MentorRunCaseDto): string | null {
    if (item.status === "skipped" && item.skipKind === "covered") return `Já coberta na lista de destino${item.coveredBy ? ` (memória ${item.coveredBy})` : ""}.`
    if (item.status === "skipped" && item.skipKind === "no_lesson") return "O redator não viu lição reaproveitável."
    if (item.status === "skipped") return "Abaixo do limiar do decisor."
    if (item.status === "discarded" && item.rejection) return `Descartado: ${item.rejection}`
    return null
}

/** Casos extraídos da transcrição, cada um com a situação, a nota, o destino e as operações. */
export function MentorRunCases({ cases }: { cases: readonly MentorRunCaseDto[] }) {
    return (
        <ol className="space-y-3" aria-label="Casos do aprendizado">
            <AnimatePresence initial={false}>
                {cases.map((item) => {
                    const outcome = caseOutcome(item)
                    return (
                        <motion.li key={item.id} variants={listItem} initial="hidden" animate="visible" exit="exit" className="space-y-2 rounded-lg border p-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <Lightbulb className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", TONE[item.status])}>{MENTOR_CASE_STATUS_LABELS[item.status]}</span>
                                <MentorRunChip>{MENTOR_CASE_NATURE_LABELS[item.nature as MentorCaseNature] ?? item.nature}</MentorRunChip>
                                <MentorRunChip>{MENTOR_CASE_SCOPE_LABELS[item.scope as MentorCaseScope] ?? item.scope}</MentorRunChip>
                                {item.score !== null && <MentorRunChip>{`nota ${percent(item.score)}`}</MentorRunChip>}
                                {item.target && <MentorRunChip>{MENTOR_TARGET_LABELS[item.target].short}</MentorRunChip>}
                            </div>
                            <p className="whitespace-pre-wrap break-words text-sm">{item.lesson}</p>
                            {item.detection && <p className="text-xs text-muted-foreground">Como detectar: {item.detection}</p>}
                            {item.evidence.length > 0 && (
                                <ul aria-label="Evidências" className="space-y-1 border-l-2 border-border pl-3">
                                    {item.evidence.map((quote, index) => (
                                        <li key={index} className="whitespace-pre-wrap break-words text-xs italic text-muted-foreground">
                                            {quote}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {item.operations.length > 0 && (
                                <ul className="space-y-1.5" aria-label="Operações">
                                    {item.operations.map((operation, index) => (
                                        <MentorRunOperation key={`${operation.op}-${operation.memoryId ?? index}`} operation={operation} />
                                    ))}
                                </ul>
                            )}
                            {outcome && <p className="text-xs text-muted-foreground">{outcome}</p>}
                            {item.deciderReason && item.status === "skipped" && !item.skipKind && <MentorRunReason>{item.deciderReason}</MentorRunReason>}
                            {item.error && (
                                <p role="alert" className="text-xs text-destructive">
                                    {item.error}
                                </p>
                            )}
                        </motion.li>
                    )
                })}
            </AnimatePresence>
        </ol>
    )
}
