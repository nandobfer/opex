"use client"

import { Badge } from "@/components/ui/badge"
import { PR_REVIEW_STATE_LABELS, PR_REVIEW_VERDICT_LABELS, type PrReviewState, type PrReviewVerdict } from "../constants"

const STATE_VARIANT: Record<PrReviewState, "secondary" | "info" | "outline" | "destructive" | "warning"> = {
    queued: "secondary",
    running: "info",
    done: "outline",
    failed: "destructive",
    interrupted: "warning",
}

const VERDICT_VARIANT: Record<PrReviewVerdict, "success" | "destructive" | "secondary"> = {
    approved: "success",
    changes_requested: "destructive",
    commented: "secondary",
}

export function PrReviewStateBadge({ state }: { state: PrReviewState }) {
    return <Badge variant={STATE_VARIANT[state]}>{PR_REVIEW_STATE_LABELS[state]}</Badge>
}

export function PrReviewVerdictBadge({ verdict }: { verdict: PrReviewVerdict | null }) {
    if (!verdict) return null
    return <Badge variant={VERDICT_VARIANT[verdict]}>{PR_REVIEW_VERDICT_LABELS[verdict]}</Badge>
}
