"use client"

import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ADVERSARIAL_DECISION_LABELS, type AdversarialDecision } from "../constants"
import type { AdversarialReviewState } from "../types"

const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 3 })

export const formatCost = (value: number) => usd.format(value)

export function formatDuration(ms: number | null): string {
    if (ms === null) return "—"
    const seconds = Math.round(ms / 1000)
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}min ${seconds % 60}s`
}

const TONE: Partial<Record<AdversarialDecision, string>> = {
    approved: "bg-emerald-500/15 text-emerald-300",
    "fix-auto": "bg-amber-500/15 text-amber-300",
    "fix-user": "bg-amber-500/15 text-amber-300",
    awaiting: "bg-amber-500/15 text-amber-300",
    rerun: "bg-sky-500/15 text-sky-300",
    skipped: "bg-muted text-muted-foreground",
    "proceeded-limit": "bg-muted text-muted-foreground",
    "proceeded-failure": "bg-muted text-muted-foreground",
    failed: "bg-destructive/15 text-destructive",
    interrupted: "bg-muted text-muted-foreground",
}

/** Decisão da rodada (ou "Revisando" enquanto roda). */
export function DecisionBadge({ decision, state }: { decision: AdversarialDecision | null; state: AdversarialReviewState }) {
    if (state === "running")
        return (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Revisando
            </span>
        )
    if (!decision) return null
    return <span className={cn("inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", TONE[decision] ?? "bg-muted text-muted-foreground")}>{ADVERSARIAL_DECISION_LABELS[decision]}</span>
}
