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
    /** Cor (variável CSS do tema) que identifica o tipo do valor: ponto no rótulo e o número colorido. */
    accentColor?: string
}

/** Cartão de indicador: rótulo, valor animado (`AnimatedNumber`), dica e rodapé opcional. */
export function KpiCard({ label, hint, value, formatter, footer, children, accentColor }: KpiCardProps) {
    return (
        <Card className={KPI_CARD_HEIGHT}>
            <CardContent className="flex h-full flex-col gap-1 p-4">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {accentColor && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accentColor }} data-accent={accentColor} aria-hidden />}
                    {label}
                </p>
                {children ?? (
                    <p className="font-mono text-xl font-bold text-foreground" style={accentColor && value !== null ? { color: accentColor } : undefined}>
                        {value === null ? <span className="text-muted-foreground">{EMPTY_METRIC}</span> : <AnimatedNumber value={value} formatter={formatter} />}
                    </p>
                )}
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
