"use client"

import type { ChartConfig } from "@/components/ui/chart"
import { BarsChart } from "./charts/BarsChart"
import { ChartCard } from "./charts/ChartCard"
import { EmptyChart } from "./charts/EmptyChart"
import { RankedBarsCard } from "./charts/RankedBarsCard"
import { colorAt } from "./charts/palette"
import { formatBrl, formatBucketLabel, formatHours } from "../format"
import type { DashboardDto } from "../types"

type Data = Pick<DashboardDto, "financeByClient" | "financeTimeline">

/** Bloco "Financeiro": faturamento por cliente, evolução mensal e horas do cliente por cliente. */
export function FinanceSection({ data }: { data: Data }) {
    const clientRows = data.financeByClient.map((client) => ({ name: client.clientName, billingBrl: client.billingBrl }))
    const clientConfig: ChartConfig = { billingBrl: { label: "Faturamento", color: colorAt(2) } }

    const hoursRows = data.financeByClient.map((client) => ({ name: client.clientName, clientHours: client.clientHours }))
    const hoursConfig: ChartConfig = { clientHours: { label: "Horas do cliente", color: colorAt(0) } }

    const timelineConfig: ChartConfig = { billingBrl: { label: "Faturamento", color: colorAt(1) } }
    const hasTimeline = data.financeTimeline.some((point) => point.billingBrl > 0)

    return (
        <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Financeiro</h2>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                <ChartCard title="Faturamento por cliente" description="Tarefas concluídas no período">
                    {clientRows.length === 0 ? (
                        <EmptyChart />
                    ) : (
                        <RankedBarsCard
                            data={clientRows}
                            labelKey="name"
                            valueKey="billingBrl"
                            config={clientConfig}
                            color={colorAt(2)}
                            ariaLabel="Faturamento por cliente"
                            valueFormatter={formatBrl}
                            table={{
                                columns: [
                                    { key: "name", label: "Cliente" },
                                    { key: "billingBrl", label: "Faturamento (R$)" },
                                ],
                                rows: clientRows,
                            }}
                        />
                    )}
                </ChartCard>

                <ChartCard title="Evolução mensal" description="Faturamento por mês dentro do período">
                    {!hasTimeline ? (
                        <EmptyChart />
                    ) : (
                        <BarsChart
                            data={data.financeTimeline}
                            xKey="bucket"
                            series={[{ key: "billingBrl", label: "Faturamento", color: colorAt(1) }]}
                            config={timelineConfig}
                            ariaLabel="Faturamento por mês"
                            xTickFormatter={formatBucketLabel}
                            valueFormatter={formatBrl}
                            table={{
                                columns: [
                                    { key: "bucket", label: "Mês" },
                                    { key: "billingBrl", label: "Faturamento (R$)" },
                                ],
                                rows: data.financeTimeline,
                            }}
                        />
                    )}
                </ChartCard>

                <ChartCard title="Horas do cliente" description="Horas do cliente (H × fator) por cliente">
                    {hoursRows.length === 0 ? (
                        <EmptyChart />
                    ) : (
                        <RankedBarsCard
                            data={hoursRows}
                            labelKey="name"
                            valueKey="clientHours"
                            config={hoursConfig}
                            color={colorAt(0)}
                            ariaLabel="Horas do cliente por cliente"
                            valueFormatter={formatHours}
                            table={{
                                columns: [
                                    { key: "name", label: "Cliente" },
                                    { key: "clientHours", label: "Horas do cliente" },
                                ],
                                rows: hoursRows,
                            }}
                        />
                    )}
                </ChartCard>
            </div>
        </section>
    )
}
