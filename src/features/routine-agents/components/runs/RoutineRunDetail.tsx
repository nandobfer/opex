"use client"

import type { ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Markdown } from "@/components/ui/markdown"
import { cn } from "@/lib/utils"
import { formatCostPair, formatDateTime, formatDuration, formatTime, formatTokens } from "../../format"
import type { RoutineRunDetailDto } from "../../types"
import { RoutinePendingAction } from "./RoutinePendingAction"
import { RoutineRunCostSection } from "./RoutineRunCostSection"
import { RoutineRunSteps } from "./RoutineRunSteps"
import { RUN_ASIDE, RUN_CARD } from "./run-page-layout"

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-sm">{value}</p>
        </div>
    )
}

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
    return (
        <section className={cn("space-y-2", className)} aria-label={title}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
            {children}
        </section>
    )
}

/** Entrada suave de cada bloco (respeita movimento reduzido). */
function useBlockMotion(index: number) {
    const reduceMotion = useReducedMotion()
    return { initial: { opacity: 0, y: reduceMotion ? 0 : 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2, delay: reduceMotion ? 0 : index * 0.04 } }
}

/**
 * Coluna principal da página da execução (OPE-208): ação pendente (Confirmar/Recusar), hibernação, solicitação,
 * erro, relato final e os passos — o que a pessoa lê e decide.
 */
export function RoutineRunMain({ run, resolvePending, onResolve }: { run: RoutineRunDetailDto; resolvePending: boolean; onResolve: (decision: "confirm" | "reject") => void }) {
    const motionProps = useBlockMotion(0)
    return (
        <motion.div {...motionProps} className={cn(RUN_CARD, "space-y-5")} data-testid="routine-run-main">
            {run.pendingAction && <RoutinePendingAction action={run.pendingAction} pending={resolvePending} onResolve={onResolve} />}
            {run.hibernation && run.status === "hibernating" && (
                <p className="rounded-md bg-muted p-2 text-sm">
                    Próxima verificação às {formatTime(run.hibernation.at)}: {run.hibernation.reason}
                </p>
            )}
            {run.request && (
                <Section title="Solicitação">
                    <p className="whitespace-pre-wrap text-sm">{run.request}</p>
                </Section>
            )}
            {run.error && <p className="rounded-md border border-destructive/40 p-2 text-sm text-destructive">{run.error}</p>}
            {run.report && (
                <Section title="Relato final">
                    <Markdown className="text-sm">{run.report}</Markdown>
                </Section>
            )}
            <Section title="Passos">
                <RoutineRunSteps steps={run.steps} />
            </Section>
        </motion.div>
    )
}

/** Coluna de resumo (OPE-208): tempos, tokens e custos, custo por modelo, avisos e ferramentas usadas. */
export function RoutineRunAside({ run }: { run: RoutineRunDetailDto }) {
    const motionProps = useBlockMotion(1)
    return (
        <motion.aside {...motionProps} className={RUN_ASIDE} aria-label="Resumo da execução" data-testid="routine-run-aside">
            <div className={cn(RUN_CARD, "space-y-4")}>
                <div className="grid grid-cols-2 gap-3">
                    <Info label="Início" value={formatDateTime(run.startedAt ?? run.queuedAt)} />
                    <Info label="Fim" value={formatDateTime(run.finishedAt)} />
                    <Info label="Duração ativa" value={formatDuration(run.activeMs)} />
                    <Info label="Esperando" value={formatDuration(run.waitingMs)} />
                    <Info label="Tokens" value={formatTokens(run.tokens)} />
                    <Info label="Custo de tabela" value={run.cost ? formatCostPair(run.cost.listUsd, run.cost.listBrl, { partial: run.cost.partial, estimated: run.cost.estimated }) : "—"} />
                    <Info label="Custo efetivo" value={run.cost ? formatCostPair(run.cost.effectiveUsd, run.cost.effectiveBrl, { partial: run.cost.partial }) : "—"} />
                    <Info label="Economia" value={run.cost ? formatCostPair(run.cost.savingsUsd, run.cost.savingsBrl) : "—"} />
                </div>
                <RoutineRunCostSection run={run} />
                {run.warnings.length > 0 && (
                    <ul className="space-y-1 text-xs text-warning">
                        {run.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                        ))}
                    </ul>
                )}
                {run.tools.length > 0 && (
                    <Section title="Ferramentas usadas">
                        <ul className="flex flex-wrap gap-1.5">
                            {run.tools.map((tool) => (
                                <li key={tool.name} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                                    <code>{tool.name}</code> × {tool.count}
                                </li>
                            ))}
                        </ul>
                    </Section>
                )}
            </div>
        </motion.aside>
    )
}
