"use client"

import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Bot, ExternalLink, Eye, RotateCcw, Square, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PrReviewDto } from "../types"
import { PrReviewStateBadge, PrReviewVerdictBadge } from "./PrReviewBadges"

export function formatDuration(ms: number | null): string {
    if (ms === null) return "—"
    const minutes = Math.floor(ms / 60_000)
    const seconds = Math.round((ms % 60_000) / 1000)
    return minutes ? `${minutes} min ${seconds} s` : `${seconds} s`
}

export const formatCost = (value: number) => (value ? `US$ ${value.toFixed(value < 0.01 ? 4 : 2)}` : "—")

interface PrReviewRowProps {
    review: PrReviewDto
    available: boolean
    busy: boolean
    onOpen: () => void
    onRerun: () => void
    onStop: () => void
}

/** Linha do histórico: PR, situação, veredito, custo, duração e ações. */
export function PrReviewRow({ review, available, busy, onOpen, onRerun, onStop }: PrReviewRowProps) {
    const active = review.state === "queued" || review.state === "running"
    return (
        <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <PrReviewStateBadge state={review.state} />
                    <PrReviewVerdictBadge verdict={review.verdict} />
                    <a href={review.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline">
                        {review.repo}#{review.number} <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                    <span className="font-mono text-[11px] text-muted-foreground">{review.headSha.slice(0, 7)}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title={review.trigger === "manual" ? "Pedida manualmente" : "Pela rotina de PRs"}>
                        {review.trigger === "manual" ? <User className="h-3 w-3" aria-hidden /> : <Bot className="h-3 w-3" aria-hidden />}
                        {review.trigger === "manual" ? "manual" : "automática"}
                    </span>
                </div>
                <p className="truncate text-sm font-medium">{review.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                    {review.author ? `@${review.author} · ` : ""}
                    {review.projectName} · {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true, locale: ptBR })} · {formatCost(review.costUsd)} · {formatDuration(review.durationMs)}
                    {review.workbenchId ? " · PR de mesa" : ""}
                </p>
                {review.summary && <p className="text-xs">{review.summary}</p>}
                {review.error && <p className="text-xs text-destructive">{review.error}</p>}
            </div>
            <div className="flex shrink-0 gap-1.5">
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onOpen}>
                    <Eye className="h-3.5 w-3.5" aria-hidden /> Ver
                </Button>
                {active ? (
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={onStop}>
                        <Square className="h-3.5 w-3.5" aria-hidden /> Parar
                    </Button>
                ) : (
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={busy || !available} onClick={onRerun}>
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Revisar de novo
                    </Button>
                )}
            </div>
        </div>
    )
}
