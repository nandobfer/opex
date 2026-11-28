"use client"

import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ItemNameLink } from "@/components/list/ItemNameLink"
import { UsageByDateChart } from "@/components/metrics/UsageByDateChart"
import { formatMetricValue } from "@/components/metrics/format"
import { routineAgentHref } from "../../constants"
import { formatDateTime } from "../../format"
import { ROUTINE_ENGINE_LABELS } from "../../schemas"
import type { RoutineAgentDto, RoutineAgentMetricsDto } from "../../types"
import { RoutineAgentStatusBadge, RoutineProvisioningBadge, RoutineRunStatusBadge } from "../RoutineBadges"
import { RoutinePauseToggle } from "../schedule/RoutinePauseToggle"
import { RoutineScheduleIndicators } from "../schedule/RoutineScheduleIndicators"
import { ROUTINE_ROW_BODY, ROUTINE_ROW_CARD, ROUTINE_ROW_CHART_CLASS, ROUTINE_ROW_CHART_HEIGHT, ROUTINE_ROW_HEADER, ROUTINE_ROW_KPI_COUNT, ROUTINE_ROW_KPI_HEIGHT, ROUTINE_ROW_KPIS } from "./routine-agents-layout"
import { routineRowKpis, type RoutineRowKpi } from "./routine-row-kpis"

type MetricsState = { status: "loading" } | { status: "error" } | { status: "ready"; metrics: RoutineAgentMetricsDto | undefined }

function RowKpi({ kpi }: { kpi: RoutineRowKpi }) {
    return (
        <div className={`flex flex-col justify-center gap-0.5 rounded-lg border bg-background/40 px-3 ${ROUTINE_ROW_KPI_HEIGHT}`} title={kpi.title ?? kpi.label} data-kpi={kpi.key}>
            <p className="flex items-start gap-1.5 text-[10px] font-bold uppercase leading-tight tracking-wider text-muted-foreground">
                {kpi.accentColor && <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: kpi.accentColor }} data-accent={kpi.accentColor} aria-hidden />}
                <span className="line-clamp-2">{kpi.label}</span>
            </p>
            <p className="truncate font-mono text-base font-bold text-foreground" style={kpi.accentColor && kpi.value !== null ? { color: kpi.accentColor } : undefined}>
                {kpi.value === null ? <span className="text-muted-foreground">—</span> : <AnimatedNumber value={kpi.value} formatter={(next) => formatMetricValue(next, kpi.format)} />}
            </p>
        </div>
    )
}

/** Skeleton do gráfico com o título (mesma altura do bloco real). */
export function RoutineRowChartSkeleton() {
    return (
        <div className="min-w-0">
            <Skeleton className="mb-1 h-3 w-24" />
            <Skeleton className={`${ROUTINE_ROW_CHART_CLASS} w-full rounded-lg`} />
        </div>
    )
}

/** Identificação do agente (linha própria, largura inteira): nome (link), selos, objetivo inteiro, motor e modelo, gatilhos. */
function RowIdentity({ agent }: { agent: RoutineAgentDto }) {
    const model = agent.engine === "opex" ? agent.opex.model : agent.opencode.model
    return (
        <div className="min-w-0 flex-1 space-y-1.5" data-testid="routine-agent-identity">
            <div className="flex flex-wrap items-center gap-2">
                <ItemNameLink href={routineAgentHref(agent.id)} className="font-semibold">
                    {agent.title}
                </ItemNameLink>
                <RoutineAgentStatusBadge status={agent.status} />
                <RoutineProvisioningBadge status={agent.provisioning.status} />
            </div>
            {/* Objetivo inteiro (pode ser gerado pelo subagente): quebra a linha, sem cortar. */}
            <p className="whitespace-pre-line break-words text-xs text-muted-foreground">{agent.objective}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>
                    {ROUTINE_ENGINE_LABELS[agent.engine]}
                    {model ? ` · ${model}` : ""}
                </span>
                {agent.lastRun ? (
                    <span className="flex items-center gap-1">
                        · Última {formatDateTime(agent.lastRun.at)} <RoutineRunStatusBadge status={agent.lastRun.status} />
                    </span>
                ) : (
                    <span>· Nenhuma execução ainda</span>
                )}
            </div>
            <RoutineScheduleIndicators agent={agent} />
        </div>
    )
}

/**
 * Item de um agente rotineiro em `/agentes-rotineiros` (OPE-130, D18; OPE-213): a identificação em linha própria
 * acima, com Pausar/Retomar; embaixo, na largura inteira, os doze KPIs (execuções, tokens e as médias, custos efetivo e
 * de tabela com as médias) e "Execuções por dia" do período escolhido nos filtros.
 */
export function RoutineAgentRow({ agent, metrics }: { agent: RoutineAgentDto; metrics: MetricsState }) {
    return (
        <Card className={`${ROUTINE_ROW_CARD} transition-colors hover:border-primary/50`} data-testid={`routine-agent-row-${agent.id}`}>
            <div className={ROUTINE_ROW_HEADER}>
                <RowIdentity agent={agent} />
                <RoutinePauseToggle agent={agent} className="shrink-0" />
            </div>
            <div className={ROUTINE_ROW_BODY} data-testid="routine-agent-body">
                {metrics.status === "loading" ? (
                    <>
                        <div className={ROUTINE_ROW_KPIS}>
                            {Array.from({ length: ROUTINE_ROW_KPI_COUNT }, (_, index) => (
                                <Skeleton key={index} className={`${ROUTINE_ROW_KPI_HEIGHT} w-full rounded-lg`} />
                            ))}
                        </div>
                        <RoutineRowChartSkeleton />
                    </>
                ) : metrics.status === "error" ? (
                    <p className="text-xs text-muted-foreground xl:col-span-2">Não foi possível carregar as métricas deste agente.</p>
                ) : (
                    <>
                        <div className={ROUTINE_ROW_KPIS} aria-label={`Indicadores do ${agent.title}`}>
                            {routineRowKpis(metrics.metrics).map((kpi) => (
                                <RowKpi key={kpi.key} kpi={kpi} />
                            ))}
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
