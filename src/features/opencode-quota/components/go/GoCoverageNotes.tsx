import { dayKeyLabel } from "../../go-logic"
import type { GoChartDto } from "../../go-types"

const days = (count: number) => (count === 1 ? "1 dia" : `${count} dias`)

/** Avisos discretos de cobertura do gráfico: dias sem dados (contam 0 no acumulado) e dias parciais. */
export function GoCoverageNotes({ chart }: { chart: GoChartDto }) {
    if (!chart.missingDays && !chart.partialDays) return null
    return (
        <div className="space-y-0.5 text-xs text-muted-foreground" role="note">
            {chart.missingDays > 0 && (
                <p data-go-note="missing">
                    Acumulado parcial: {days(chart.missingDays)} sem dados, contados como 0 (o Console guarda o histórico desde {dayKeyLabel(chart.historyFrom, true)}).
                </p>
            )}
            {chart.partialDays > 0 && <p data-go-note="partial">{days(chart.partialDays)} com uso de modelo sem cota no catálogo do Go: esse custo ficou fora da soma.</p>}
        </div>
    )
}
