"use client"

import Link from "next/link"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { UsageByDateChart } from "@/components/metrics/UsageByDateChart"
import { formatMetricValue } from "@/components/metrics/format"
import { routineAgentHref } from "../../constants"
import { formatDateTime } from "../../format"
import { ROUTINE_ENGINE_LABELS } from "../../schemas"
import type { RoutineAgentDto, RoutineAgentMetricsDto } from "../../types"
import { RoutineAgentStatusBadge, RoutineProvisioningBadge, RoutineRunStatusBadge } from "../RoutineBadges"
import { ROUTINE_ROW_CHART_CLASS, ROUTINE_ROW_CHART_HEIGHT, ROUTINE_ROW_GRID, ROUTINE_ROW_KPI_HEIGHT, ROUTINE_ROW_KPIS } from "./routine-agents-layout"

type MetricsState = { status: "loading" } | { status: "error" } | { status: "ready"; metrics: RoutineAgentMetricsDto | undefined }

function RowKpi({ label, value, format }: { label: string; value: number; format: "count" | "tokens" }) {
    return (
        <div className={`flex flex-col justify-center rounded-lg border bg-background/40 px-3 ${ROUTINE_ROW_KPI_HEIGHT}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="font-mono text-lg font-bold text-foreground">
                <AnimatedNumber value={value} formatter={(next) => formatMetricValue(next, format)} />
            </p>
        </div>
    )
}

/**
 * Linha de um agente rotineiro em `/agentes-rotineiros` (OPE-130, D18): identificação (link para a página
 * do agente), quatro KPIs e "Execuções por dia" do período escolhido nos filtros.
 */
export function RoutineAgentRow({ agent, metrics }: { agent: RoutineAgentDto; metrics: MetricsState }) {
    const model = agent.engine === "opex" ? agent.opex.model : agent.opencode.model
    return (
        <Card className="transition-colors hover:border-primary/50" data-testid={`routine-agent-row-${agent.id}`}>
            <div className={ROUTINE_ROW_GRID}>
                <Link href={routineAgentHref(agent.id)} className="min-w-0 space-y-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold hover:underline">{agent.title}</span>
                        <RoutineAgentStatusBadge status={agent.status} />
                        <RoutineProvisioningBadge status={agent.provisioning.status} />
                    </div>
                    {/* Objetivo inteiro (pode ser gerado pelo subagente): quebra a linha, sem cortar. */}
                    <p className="whitespace-pre-line break-words text-xs text-muted-foreground">
                        {agent.objective}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                        {ROUTINE_ENGINE_LABELS[agent.engine]}
                        {model ? ` · ${model}` : ""}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        {agent.lastRun ? (
                            <span className="flex items-center gap-1">
                                Última {formatDateTime(agent.lastRun.at)} <RoutineRunStatusBadge status={agent.lastRun.status} />
                            </span>
                        ) : (
                            <span>Nenhuma execução ainda</span>
                        )}
                        <span>· Próximo disparo {formatDateTime(agent.nextFireAt)}</span>
                    </div>
                </Link>
                {metrics.status === "loading" ? (
                    <>
                        <div className={ROUTINE_ROW_KPIS}>
                            {[0, 1, 2, 3].map((index) => (
                                <Skeleton key={index} className={`${ROUTINE_ROW_KPI_HEIGHT} w-full rounded-lg`} />
                            ))}
                        </div>
                        <Skeleton className={`${ROUTINE_ROW_CHART_CLASS} w-full rounded-lg`} />
                    </>
                ) : metrics.status === "error" ? (
                    <p className="text-xs text-muted-foreground lg:col-span-2">Não foi possível carregar as métricas deste agente.</p>
                ) : (
                    <>
                        <div className={ROUTINE_ROW_KPIS} aria-label={`Indicadores do ${agent.title}`}>
                            <RowKpi label="Execuções" value={metrics.metrics?.kpis.runs ?? 0} format="count" />
                            <RowKpi label="Concluídas" value={metrics.metrics?.kpis.completed ?? 0} format="count" />
                            <RowKpi label="Com erro" value={metrics.metrics?.kpis.errors ?? 0} format="count" />
                            <RowKpi label="Tokens" value={metrics.metrics?.kpis.tokens ?? 0} format="tokens" />
                        </div>
                        <div className="min-w-0">
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Execuções por dia</p>
                            {metrics.metrics?.days.some((day) => day.runs > 0) ? (
                                <UsageByDateChart height={ROUTINE_ROW_CHART_HEIGHT} unit="execuções" points={metrics.metrics.days.map((day) => ({ bucket: day.day, runs: day.runs, failures: day.errors }))} />
                            ) : (
                                <p className={`flex items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground ${ROUTINE_ROW_CHART_CLASS}`}>Sem execuções no período.</p>
                            )}
                        </div>
                    </>
                )}
            </div>
        </Card>
    )
}
