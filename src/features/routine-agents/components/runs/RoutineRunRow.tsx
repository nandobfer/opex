"use client"

import { ChevronRight } from "lucide-react"
import { ROUTINE_TRIGGER_ORIGIN_LABELS } from "../../status"
import type { RoutineRunDto } from "../../types"
import { formatCost, formatDateTime, formatDuration, formatTime, formatTokens } from "../../format"
import { RoutineRunStatusBadge } from "../RoutineBadges"

export const ROUTINE_RUN_ROW_HEIGHT = 64

/** Linha de uma execução: status, origem, início, duração, tokens e custo. */
export function RoutineRunRow({ run, onOpen }: { run: RoutineRunDto; onOpen: () => void }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            className="flex min-h-[64px] w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Abrir a execução #${run.seq}`}
        >
            <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">#{run.seq}</span>
            <RoutineRunStatusBadge status={run.status} />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{run.request ?? run.report ?? run.error ?? ROUTINE_TRIGGER_ORIGIN_LABELS[run.origin]}</span>
                <span className="block truncate text-xs text-muted-foreground">
                    {ROUTINE_TRIGGER_ORIGIN_LABELS[run.origin]} · início {formatDateTime(run.startedAt ?? run.queuedAt)}
                    {run.hibernation && run.status === "hibernating" ? ` · próxima verificação às ${formatTime(run.hibernation.at)}` : ""}
                </span>
            </span>
            <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground sm:block">{formatDuration(run.activeMs)}</span>
            <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground md:block" title={`${run.tokens} tokens`}>
                {formatTokens(run.tokens)} tok
            </span>
            <span className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground lg:block">{formatCost(run.costUsd, run.costPartial)}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
    )
}
