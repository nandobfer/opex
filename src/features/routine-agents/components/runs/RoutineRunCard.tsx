"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Ban, CalendarClock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ItemNameLink } from "@/components/list/ItemNameLink"
import { cn } from "@/lib/utils"
import { routineRunPath } from "../../constants"
import { ROUTINE_TRIGGER_ORIGIN_LABELS, canCancelRun } from "../../status"
import type { RoutineRunDto } from "../../types"
import { RoutineRunStatusBadge } from "../RoutineBadges"
import { RoutineRunCardCost } from "./RoutineRunCardCost"
import { RoutineRunCardNotices } from "./RoutineRunCardNotices"
import { ROUTINE_RUN_CARD_CLASS, isLiveRun, reportExcerpt, runCardTimes, runEngineLabel } from "./run-card"

/**
 * Card de uma execução na aba Execuções (OPE-213, no lugar da linha): situação com ícone, origem, tempos, pedido,
 * início do relato, avisos (erro, confirmação, hibernação), consumo, motor e modelo. O título é o link para a página
 * da execução (decisão do dono, 27/11/2026: sem botão "Abrir"); Cancelar só nos status não finais.
 */
export function RoutineRunCard({ run, onCancel }: { run: RoutineRunDto; onCancel?: (run: RoutineRunDto) => void }) {
    const reduceMotion = useReducedMotion()
    const live = isLiveRun(run)
    const times = runCardTimes(run)
    const excerpt = reportExcerpt(run.report)
    return (
        <motion.article
            initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(ROUTINE_RUN_CARD_CLASS, "space-y-3 transition-colors hover:border-primary/50", live && "border-primary/70 ring-1 ring-primary/40")}
            aria-label={`Execução #${run.seq}`}
            data-testid={`routine-run-card-${run.id}`}
            data-live={live ? "true" : "false"}
        >
            <header className="flex flex-wrap items-center gap-2">
                <RoutineRunStatusBadge status={run.status} withIcon />
                <AnimatePresence initial={false}>
                    {live && (
                        <motion.span
                            key="live"
                            className="h-2 w-2 rounded-full bg-primary"
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={reduceMotion ? { opacity: 1, scale: 1 } : { opacity: [1, 0.35, 1], scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            transition={reduceMotion ? { duration: 0.15 } : { opacity: { duration: 1.6, repeat: Infinity }, scale: { duration: 0.2 } }}
                            aria-label="Em execução"
                            data-testid="run-card-live"
                        />
                    )}
                </AnimatePresence>
                <ItemNameLink href={routineRunPath(run.agentId, run.id)} className="text-sm font-semibold">
                    Execução #{run.seq}
                </ItemNameLink>
                <Badge variant="outline" className="whitespace-nowrap font-normal" data-testid="run-card-origin">
                    {ROUTINE_TRIGGER_ORIGIN_LABELS[run.origin]}
                </Badge>
                <span className="ml-auto flex min-w-0 items-center gap-2">
                    <span className="truncate text-xs text-muted-foreground" title={runEngineLabel(run)}>
                        {runEngineLabel(run)}
                    </span>
                    {onCancel && canCancelRun(run.status) && (
                        <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5" onClick={() => onCancel(run)}>
                            <Ban className="h-3.5 w-3.5" aria-hidden /> Cancelar
                        </Button>
                    )}
                </span>
            </header>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="run-card-times">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                <span>Início {times.start}</span>
                {times.end && <span>· Término {times.end}</span>}
                {times.duration && <span>· Duração {times.duration}</span>}
            </p>
            {run.request && (
                <p className="whitespace-pre-line break-words text-sm" data-testid="run-card-request">
                    <span className="font-medium text-muted-foreground">Pedido: </span>
                    {run.request}
                </p>
            )}
            {excerpt && (
                <p className="line-clamp-3 whitespace-pre-line break-words text-sm text-muted-foreground" data-testid="run-card-report">
                    {excerpt}
                </p>
            )}
            <RoutineRunCardNotices run={run} />
            <RoutineRunCardCost run={run} />
        </motion.article>
    )
}
