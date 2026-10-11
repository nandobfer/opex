"use client"

import { Card, CardContent } from "@/components/ui/card"
import type { ChartConfig } from "@/components/ui/chart"
import { BarsChart } from "./charts/BarsChart"
import { ChartCard } from "./charts/ChartCard"
import { EmptyChart } from "./charts/EmptyChart"
import { RankedBarsCard } from "./charts/RankedBarsCard"
import { colorAt } from "./charts/palette"
import { formatCount } from "../format"
import type { DashboardDto } from "../types"

type Data = Pick<DashboardDto, "workbenchFunnel" | "workbenchByProject">

/** Bloco "Central de desenvolvimento": funil de etapas, mesas por projeto e a situação atual. */
export function DevCenterSection({ data, active, running }: { data: Data; active: number; running: number }) {
    const funnelRows = data.workbenchFunnel.map((step) => ({ label: step.label, count: step.count }))
    const funnelConfig: ChartConfig = { count: { label: "Mesas", color: colorAt(4) } }
    const projectRows = data.workbenchByProject.map((project) => ({ name: project.sigla ? `${project.sigla} · ${project.name}` : project.name, count: project.count }))
    const projectConfig: ChartConfig = { count: { label: "Mesas", color: colorAt(5) } }
    const hasFunnel = data.workbenchFunnel.some((step) => step.count > 0)

    return (
        <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Central de desenvolvimento</h2>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                <ChartCard title="Funil de etapas" description="Mesas por passo (Plano → Concluída)">
                    {!hasFunnel ? (
                        <EmptyChart message="Nenhuma mesa em andamento." />
                    ) : (
                        <BarsChart
                            data={funnelRows}
                            xKey="label"
                            series={[{ key: "count", label: "Mesas", color: colorAt(4) }]}
                            config={funnelConfig}
                            ariaLabel="Mesas por passo do funil"
                            valueFormatter={formatCount}
                            table={{
                                columns: [
                                    { key: "label", label: "Passo" },
                                    { key: "count", label: "Mesas" },
                                ],
                                rows: funnelRows,
                            }}
                        />
                    )}
                </ChartCard>

                <ChartCard title="Mesas por projeto" description="Mesas ativas por projeto">
                    {projectRows.length === 0 ? (
                        <EmptyChart message="Nenhuma mesa em andamento." />
                    ) : (
                        <RankedBarsCard
                            data={projectRows}
                            labelKey="name"
                            valueKey="count"
                            config={projectConfig}
                            color={colorAt(5)}
                            ariaLabel="Mesas ativas por projeto"
                            valueFormatter={formatCount}
                            table={{
                                columns: [
                                    { key: "name", label: "Projeto" },
                                    { key: "count", label: "Mesas" },
                                ],
                                rows: projectRows,
                            }}
                        />
                    )}
                </ChartCard>

                <ChartCard title="Situação atual" description="Instantâneo das mesas de trabalho">
                    <div className="flex h-[240px] flex-col justify-center gap-4">
                        <Card>
                            <CardContent className="flex items-center justify-between p-4">
                                <span className="text-xs text-muted-foreground">Mesas ativas</span>
                                <span className="font-mono text-xl font-bold text-foreground">{formatCount(active)}</span>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="flex items-center justify-between p-4">
                                <span className="text-xs text-muted-foreground">Executando agora</span>
                                <span className="font-mono text-xl font-bold text-foreground">{formatCount(running)}</span>
                            </CardContent>
                        </Card>
                    </div>
                </ChartCard>
            </div>
        </section>
    )
}
