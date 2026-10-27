"use client"

import type { ReactNode } from "react"
import { Swords } from "lucide-react"
import { cn } from "@/lib/utils"

/** Tom do card: aprovado (verde), bloqueou (âmbar), falhou (vermelho) ou revisando (primária). */
export type VerdictTone = "approved" | "blocked" | "failed" | "running"

const CARD: Record<VerdictTone, string> = {
    approved: "border-emerald-500/40 bg-emerald-500/5",
    blocked: "border-amber-500/40 bg-amber-500/5",
    failed: "border-destructive/40 bg-destructive/5",
    running: "border-primary/40 bg-primary/5",
}

const ACCENT: Record<VerdictTone, string> = {
    approved: "text-emerald-400",
    blocked: "text-amber-300",
    failed: "text-destructive",
    running: "text-primary",
}

interface VerdictCardProps {
    round: number
    level: string
    outcome: ReactNode
    tone: VerdictTone
    /** Ações à direita do cabeçalho. */
    actions?: ReactNode
    children?: ReactNode
}

/** Card do veredito de uma rodada: o mesmo na Saída da IA e na aba "Adversário" da mesa. */
export function VerdictCard({ round, level, outcome, tone, actions, children }: VerdictCardProps) {
    return (
        <div className={cn("space-y-2 rounded-lg border p-3", CARD[tone])}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
                <Swords className={cn("h-4 w-4", ACCENT[tone])} aria-hidden />
                <span className="font-semibold text-foreground">Agente adversário · rodada {round}</span>
                <span className="text-muted-foreground">{level}</span>
                <span className={ACCENT[tone]}>{outcome}</span>
                {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
            </div>
            {children}
        </div>
    )
}
