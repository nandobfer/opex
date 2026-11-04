"use client"

import { ArrowRight, History } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/feedback/EmptyState"
import { MENTOR_REORG_ACTION_LABELS, MENTOR_TARGET_LABELS, type MentorReorgAction } from "../../../mentor/constants"
import type { MentorReorgSummaryDto } from "../../../mentor/types"
import { formatReorgCost, formatReorgDate } from "./format"
import { MentorReorgBadge } from "./MentorReorgProgress"

/** Histórico das revisões do acervo: situação, progresso, custo e o atalho para abrir o plano. */
export function MentorReorgHistory({ items, onOpen }: { items: MentorReorgSummaryDto[]; onOpen: (id: string) => void }) {
    if (!items.length) {
        return <EmptyState icon={History} title="Nenhuma revisão do acervo ainda" description="Use o botão acima para revisar todas as memórias que o Mentor enxerga. A prévia aparece aqui antes de qualquer gravação." />
    }
    return (
        <ul className="divide-y rounded-lg border">
            {items.map((run) => (
                <li key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                    <MentorReorgBadge status={run.status} />
                    <span className="text-muted-foreground">
                        {run.done} de {run.total} memórias
                    </span>
                    <span className="text-muted-foreground">· {formatReorgCost(run.costUsd)}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{formatReorgDate(run.createdAt)}</span>
                    <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => onOpen(run.id)}>
                        Ver plano <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                </li>
            ))}
        </ul>
    )
}

/** Texto do resumo de um plano ("3 mover · 1 fundir"). */
export function actionSummary(counts: Partial<Record<MentorReorgAction, number>>): string {
    return (Object.entries(counts) as [MentorReorgAction, number][])
        .filter(([, count]) => count > 0)
        .map(([action, count]) => `${count} ${MENTOR_REORG_ACTION_LABELS[action].toLowerCase()}`)
        .join(" · ")
}

export const targetShort = (target: string) => MENTOR_TARGET_LABELS[target as keyof typeof MENTOR_TARGET_LABELS]?.short ?? target
