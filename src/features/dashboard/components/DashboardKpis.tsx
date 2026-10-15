"use client"

import { motion } from "framer-motion"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { Card, CardContent } from "@/components/ui/card"
import { fadeUp } from "@/components/motion/presets"
import { formatMinutes } from "@/features/tasks/format"
import { formatBrl, formatCount, formatHours, formatUsd } from "../format"
import type { DashboardKpis as Kpis } from "../types"

/** Um cartão de indicador: rótulo, dica, valor e formatador. */
export interface DashboardKpiItem {
    label: string
    hint: string
    value: number
    formatter: (value: number) => string
}

/**
 * Linha de KPIs da tela, recebendo os indicadores da página que a usa (o dono monta os seus com
 * `dashboardKpiItems`; o portal do cliente monta o recorte dele). A apresentação é única.
 */
export function DashboardKpis({ items }: { items: readonly DashboardKpiItem[] }) {
    return (
        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {items.map((item) => (
                <Card key={item.label}>
                    <CardContent className="flex flex-col gap-1 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{item.label}</p>
                        <p className="font-mono text-xl font-bold text-foreground">
                            <AnimatedNumber value={item.value} formatter={item.formatter} />
                        </p>
                        <p className="text-[11px] text-muted-foreground">{item.hint}</p>
                    </CardContent>
                </Card>
            ))}
        </motion.div>
    )
}

/** Indicadores da tela Dashboards do **dono** (quadro, período e mesas). */
export function dashboardKpiItems(kpis: Kpis): DashboardKpiItem[] {
    return [
        { label: "Tarefas ativas", hint: "Não arquivadas", value: kpis.tasksActive, formatter: formatCount },
        { label: "Em andamento", hint: "Fora das colunas de conclusão", value: kpis.tasksInProgress, formatter: formatCount },
        { label: "Concluídas", hint: "No período", value: kpis.tasksCompleted, formatter: formatCount },
        { label: "Faturamento", hint: "No período", value: kpis.billingBrl, formatter: formatBrl },
        { label: "Horas do cliente", hint: "No período", value: kpis.clientHours, formatter: formatHours },
        { label: "Horas agênticas", hint: "No período", value: kpis.loggedMinutes, formatter: formatMinutes },
        { label: "Custo de IA", hint: "No período · USD", value: kpis.costUsd, formatter: formatUsd },
        { label: "Mesas ativas", hint: "Situação atual", value: kpis.activeWorkbenches, formatter: formatCount },
        { label: "Mesas executando", hint: "Situação atual", value: kpis.runningWorkbenches, formatter: formatCount },
        { label: "Serviços", hint: "No período", value: kpis.services, formatter: formatCount },
    ]
}
