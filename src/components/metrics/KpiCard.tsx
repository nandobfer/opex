"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { fadeUp } from "@/components/motion/presets"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { EMPTY_METRIC } from "./format"
import { KPI_CARD_HEIGHT, KPI_GRID } from "./layout"

export interface KpiCardProps {
    label: string
    hint: ReactNode
    /** `null` mostra "—" (sem base no período). */
    value: number | null
    formatter: (value: number) => string
    /** Linha extra abaixo da dica (ex.: "Dados desde 03/11/2026"). */
    footer?: ReactNode
    /** Conteúdo no lugar do número (ex.: data do Último uso). */
    children?: ReactNode
}

/** Cartão de indicador: rótulo, valor animado (`AnimatedNumber`), dica e rodapé opcional. */
export function KpiCard({ label, hint, value, formatter, footer, children }: KpiCardProps) {
    return (
        <Card className={KPI_CARD_HEIGHT}>
            <CardContent className="flex h-full flex-col gap-1 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
                {children ?? <p className="font-mono text-xl font-bold text-foreground">{value === null ? <span className="text-muted-foreground">{EMPTY_METRIC}</span> : <AnimatedNumber value={value} formatter={formatter} />}</p>}
                <p className="text-[11px] text-muted-foreground">{hint}</p>
                {footer && <p className="text-[10px] text-muted-foreground/80">{footer}</p>}
            </CardContent>
        </Card>
    )
}

/** Grade de KPIs (Dashboards e Visão geral dos agentes), com entrada animada. */
export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <motion.div variants={fadeUp} initial="hidden" animate="visible" className={cn(KPI_GRID, className)}>
            {children}
        </motion.div>
    )
}
