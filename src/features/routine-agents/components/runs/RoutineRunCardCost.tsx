"use client"

import { Coins } from "lucide-react"
import { COST_KIND_TONE, type CostKind } from "@/features/ai-billing/cost-tone"
import { formatTokens } from "../../format"
import type { RoutineRunDto } from "../../types"
import { runCostCell } from "./run-card"

const KINDS: { kind: CostKind; label: string }[] = [
    { kind: "effective", label: "Efetivo" },
    { kind: "list", label: "Tabela" },
]

/** Consumo do card (OPE-213): tokens e os custos efetivo e de tabela, cada um na cor do seu tipo. */
export function RoutineRunCardCost({ run }: { run: RoutineRunDto }) {
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Consumo da execução">
            <span className="flex items-center gap-1" title={`${run.tokens} tokens`}>
                <Coins className="h-3.5 w-3.5" aria-hidden />
                <span className="font-mono text-foreground">{formatTokens(run.tokens)}</span> tokens
            </span>
            {KINDS.map(({ kind, label }) => {
                const cell = runCostCell(run, kind)
                return (
                    <span key={kind} className="flex items-center gap-1.5" title={cell.title} data-cost={kind}>
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COST_KIND_TONE[kind].color }} aria-hidden />
                        {label}
                        <span className="font-mono font-semibold" style={cell.known ? { color: COST_KIND_TONE[kind].color } : undefined} data-cost-value={kind}>
                            {cell.text}
                        </span>
                    </span>
                )
            })}
        </div>
    )
}
