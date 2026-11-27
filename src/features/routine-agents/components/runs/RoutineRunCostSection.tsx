"use client"

import { formatMoneyPair } from "@nandobfer/integracoes/modules/integrations/ia/features/ai-billing/money"
import type { RoutineRunDetailDto } from "../../types"

/**
 * Custo da execução por modelo e os avisos (OPE-203): modelos sem preço, passos estimados e o que deixou o total
 * parcial. Motor OpenCode: fora do escopo desta versão.
 */
export function RoutineRunCostSection({ run }: { run: RoutineRunDetailDto }) {
    if (!run.cost) {
        return run.engine === "opencode" ? <p className="text-xs text-muted-foreground">Motor OpenCode: custo de tabela e efetivo fora desta versão.</p> : null
    }
    const notes = [
        ...(run.cost.missingPrices.length ? [`Sem preço (total parcial): ${run.cost.missingPrices.join(", ")}.`] : []),
        ...(run.cost.estimated ? ["Custo estimado pelos tokens guardados (sem a separação do cache)."] : []),
        ...run.cost.notices,
    ]
    return (
        <section className="space-y-2" aria-label="Custo da execução">
            <h3 className="text-xs font-semibold">Custo por modelo</h3>
            {run.costByModel.length ? (
                <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                        <tr>
                            <th className="py-1 text-left font-medium">Modelo</th>
                            <th className="py-1 text-right font-medium">Tabela</th>
                            <th className="py-1 text-right font-medium">Efetivo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {run.costByModel.map((row) => (
                            <tr key={row.key} className="border-t">
                                <td className="py-1 pr-2">{row.label}</td>
                                <td className="py-1 text-right font-mono">{formatMoneyPair(row.listUsd, row.listBrl)}</td>
                                <td className="py-1 text-right font-mono">
                                    {formatMoneyPair(row.effectiveUsd, row.effectiveBrl)}
                                    {row.partial ? " (parcial)" : ""}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p className="text-xs text-muted-foreground">Sem passos com consumo registrado.</p>
            )}
            {notes.length > 0 && (
                <ul className="space-y-1 text-xs text-muted-foreground">
                    {notes.map((note) => (
                        <li key={note}>{note}</li>
                    ))}
                </ul>
            )}
        </section>
    )
}
