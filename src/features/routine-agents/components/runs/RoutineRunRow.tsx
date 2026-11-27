"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { routineRunPath } from "../../constants"
import { ROUTINE_TRIGGER_ORIGIN_LABELS } from "../../status"
import type { RoutineRunDto } from "../../types"
import { formatCostPair, formatDateTime, formatDuration, formatTime, formatTokens } from "../../format"
import { formatUsd } from "@/features/ai-billing/money"
import { RoutineRunStatusBadge } from "../RoutineBadges"

export const ROUTINE_RUN_ROW_HEIGHT = 64

/** Dica das colunas de custo (OPE-203): o par US$/R$ e as marcações; motor OpenCode fica fora desta versão. */
function costCell(run: RoutineRunDto, kind: "list" | "effective"): { text: string; title: string } {
    if (!run.cost) return { text: "—", title: run.engine === "opencode" ? "Motor OpenCode: custo de tabela e efetivo fora desta versão" : "Sem consumo registrado" }
    const usd = kind === "list" ? run.cost.listUsd : run.cost.effectiveUsd
    const brl = kind === "list" ? run.cost.listBrl : run.cost.effectiveBrl
    const label = kind === "list" ? "Custo de tabela" : "Custo efetivo"
    const marks = run.cost.partial ? "*" : ""
    return { text: usd === null ? `—${marks}` : `${formatUsd(usd)}${marks}`, title: `${label}: ${formatCostPair(usd, brl, { partial: run.cost.partial, estimated: run.cost.estimated })}` }
}

/** Linha de uma execução (link para a página dela): status, origem, início, duração, tokens, custo de tabela e custo efetivo. */
export function RoutineRunRow({ run }: { run: RoutineRunDto }) {
    return (
        <Link
            href={routineRunPath(run.agentId, run.id)}
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
            {(["list", "effective"] as const).map((kind) => {
                const cell = costCell(run, kind)
                return (
                    <span key={kind} className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground lg:block" title={cell.title} data-cost={kind}>
                        {cell.text}
                    </span>
                )
            })}
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
    )
}
