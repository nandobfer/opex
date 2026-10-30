"use client"

import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { MENTOR_RUN_STATUS_LABELS, MENTOR_TARGET_LABELS, type MentorRunStatus, type MentorTarget } from "../../mentor/constants"

const TONE: Record<MentorRunStatus, string> = {
    queued: "bg-muted text-muted-foreground",
    running: "bg-primary/15 text-primary",
    skipped: "bg-muted text-muted-foreground",
    discarded: "bg-muted text-muted-foreground",
    suggested: "bg-amber-500/15 text-amber-300",
    created: "bg-emerald-500/15 text-emerald-300",
    updated: "bg-sky-500/15 text-sky-300",
    failed: "bg-destructive/15 text-destructive",
}

/** Situação de uma execução do Mentor. */
export function MentorRunBadge({ status }: { status: MentorRunStatus }) {
    return (
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", TONE[status])}>
            {(status === "running" || status === "queued") && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
            {MENTOR_RUN_STATUS_LABELS[status]}
        </span>
    )
}

/** Lista de destino da execução (escolhida pelo Triador). */
export function MentorTargetBadge({ target }: { target: MentorTarget }) {
    return <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{MENTOR_TARGET_LABELS[target].short}</span>
}

export const formatScore = (score: number | null, threshold: number) => (score === null ? `limiar ${Math.round(threshold * 100)}%` : `nota ${Math.round(score * 100)}% / limiar ${Math.round(threshold * 100)}%`)
