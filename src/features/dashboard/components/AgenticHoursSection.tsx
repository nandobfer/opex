"use client"

import type { ChartConfig } from "@/components/ui/chart"
import { formatMinutes } from "@/features/tasks/format"
import { BarsChart } from "./charts/BarsChart"
import { ChartCard } from "./charts/ChartCard"
import { EmptyChart } from "./charts/EmptyChart"
import { RankedBarsCard } from "./charts/RankedBarsCard"
import { TrendLineChart } from "./charts/TrendLineChart"
import { colorAt } from "./charts/palette"
import { formatBucketLabel, formatTokens, formatUsd } from "../format"
import type { DashboardDto } from "../types"

type Data = Pick<DashboardDto, "timeByDay" | "costByProject" | "timeByStage" | "tokensByModel">

/** Bloco "Horas agênticas": horas/custo por dia, custo por projeto, horas por etapa e tokens por modelo. */
export function AgenticHoursSection({ data }: { data: Data }) {
    const minutesConfig: ChartConfig = { minutes: { label: "Horas", color: colorAt(0) } }
    const costDayConfig: ChartConfig = { costUsd: { label: "Custo", color: colorAt(3) } }
    const stageRows = data.timeByStage.map((stage) => ({ label: stage.label, minutes: stage.minutes }))
    const stageConfig: ChartConfig = { minutes: { label: "Horas", color: colorAt(1) } }
    const modelRows = data.tokensByModel.map((model) => ({ model: model.model === "none" ? "Sem modelo" : model.model, input: model.inputTokens, output: model.outputTokens, reasoning: model.reasoningTokens }))
    const modelConfig: ChartConfig = {
        input: { label: "Entrada", color: colorAt(0) },
        output: { label: "Saída", color: colorAt(1) },
        reasoning: { label: "Raciocínio", color: colorAt(3) },
    }

    const hasTime = data.timeByDay.some((point) => point.minutes > 0 || point.costUsd > 0)
    const hasCost = data.timeByDay.some((point) => point.costUsd > 0)

    return (
        <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Horas agênticas</h2>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                <ChartCard title="Horas por dia" description="Duração consolidada dos apontamentos">
                    {!hasTime ? (
                        <EmptyChart />
                    ) : (
                        <BarsChart
                            data={data.timeByDay}
                            xKey="bucket"
                            series={[{ key: "minutes", label: "Horas", color: colorAt(0) }]}
                            config={minutesConfig}
                            ariaLabel="Horas por dia"
                            xTickFormatter={formatBucketLabel}
                            valueFormatter={formatMinutes}
                            table={{
                                columns: [
                                    { key: "bucket", label: "Período" },
                                    { key: "minutes", label: "Minutos" },
                                ],
                                rows: data.timeByDay,
                            }}
                        />
                    )}
                </ChartCard>

                <ChartCard title="Custo por dia" description="Custo de IA em dólares (USD)">
                    {!hasCost ? (
                        <EmptyChart />
                    ) : (
                        <TrendLineChart
                            data={data.timeByDay}
                            xKey="bucket"
                            series={[{ key: "costUsd", label: "Custo", color: colorAt(3) }]}
                            config={costDayConfig}
                            ariaLabel="Custo de IA por dia"
                            xTickFormatter={formatBucketLabel}
                            valueFormatter={formatUsd}
                            table={{
                                columns: [
                                    { key: "bucket", label: "Período" },
                                    { key: "costUsd", label: "Custo (US$)" },
                                ],
                                rows: data.timeByDay,
                            }}
                        />
                    )}
                </ChartCard>

                <ChartCard title="Custo por projeto" description="Custo de IA por projeto no período">
                    {data.costByProject.length === 0 ? (
                        <EmptyChart />
                    ) : (
                        <RankedBarsCard
                            data={data.costByProject.map((project) => ({ name: project.sigla ? `${project.sigla} · ${project.name}` : project.name, costUsd: project.costUsd }))}
                            labelKey="name"
                            valueKey="costUsd"
                            config={{ costUsd: { label: "Custo", color: colorAt(3) } }}
                            color={colorAt(3)}
                            ariaLabel="Custo de IA por projeto"
                            valueFormatter={formatUsd}
                            table={{
                                columns: [
                                    { key: "name", label: "Projeto" },
                                    { key: "costUsd", label: "Custo (US$)" },
                                ],
                                rows: data.costByProject.map((project) => ({ name: project.sigla ? `${project.sigla} · ${project.name}` : project.name, costUsd: project.costUsd })),
                            }}
                        />
                    )}
                </ChartCard>

                <ChartCard title="Horas por etapa" description="Duração por etapa do desenvolvimento">
                    {stageRows.length === 0 ? (
                        <EmptyChart />
                    ) : (
                        <BarsChart
                            data={stageRows}
                            xKey="label"
                            series={[{ key: "minutes", label: "Horas", color: colorAt(1) }]}
                            config={stageConfig}
                            ariaLabel="Horas por etapa"
                            valueFormatter={formatMinutes}
                            table={{
                                columns: [
                                    { key: "label", label: "Etapa" },
                                    { key: "minutes", label: "Minutos" },
                                ],
                                rows: stageRows,
                            }}
                        />
                    )}
                </ChartCard>

                <ChartCard title="Tokens por modelo" description="Entrada, saída e raciocínio por modelo">
                    {modelRows.length === 0 ? (
                        <EmptyChart />
                    ) : (
                        <BarsChart
                            data={modelRows}
                            xKey="model"
                            series={[
                                { key: "input", label: "Entrada", color: colorAt(0) },
                                { key: "output", label: "Saída", color: colorAt(1) },
                                { key: "reasoning", label: "Raciocínio", color: colorAt(3) },
                            ]}
                            config={modelConfig}
                            ariaLabel="Tokens por modelo"
                            valueFormatter={formatTokens}
                            table={{
                                columns: [
                                    { key: "model", label: "Modelo" },
                                    { key: "input", label: "Entrada" },
                                    { key: "output", label: "Saída" },
                                    { key: "reasoning", label: "Raciocínio" },
                                ],
                                rows: modelRows,
                            }}
                        />
                    )}
                </ChartCard>
            </div>
        </section>
    )
}
