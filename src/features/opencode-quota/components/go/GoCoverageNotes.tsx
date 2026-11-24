import { formatGoFullDate, goSharedKeyGroups } from "../../go-logic"
import type { GoChartDto, GoKeyScopeDto } from "../../go-types"

const days = (count: number) => (count === 1 ? "1 dia" : `${count} dias`)

const names = (list: readonly string[]) => (list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} e ${list.at(-1)}`)

/**
 * Avisos discretos de cobertura do ciclo exibido: dias sem dados (contam 0 no acumulado), dias parciais e, na soma
 * de várias chaves (OPE-180), dias em que alguma assinatura ficou sem dados, chaves que leem a mesma assinatura e
 * de qual chave é o ciclo quando as assinaturas têm ciclos diferentes.
 */
export function GoCoverageNotes({ chart, scope = null }: { chart: GoChartDto; scope?: GoKeyScopeDto | null }) {
    const shared = goSharedKeyGroups(scope)
    const cycleNote = scope?.cyclesDiffer && scope.cycleKeyName ? scope.cycleKeyName : null
    if (!chart.missingDays && !chart.partialDays && !chart.incompleteDays && !shared.length && !cycleNote) return null
    return (
        <div className="space-y-0.5 text-xs text-muted-foreground" role="note">
            {chart.missingDays > 0 && (
                <p data-go-note="missing">
                    Acumulado parcial: {days(chart.missingDays)} do ciclo sem dados, contados como 0 (o Console guarda o histórico desde{" "}
                    {formatGoFullDate(Date.parse(`${chart.historyFrom}T12:00:00.000Z`))}).
                </p>
            )}
            {chart.partialDays > 0 && <p data-go-note="partial">{days(chart.partialDays)} com uso de modelo sem cota no catálogo do Go: esse custo ficou fora da soma.</p>}
            {chart.incompleteDays > 0 && <p data-go-note="incomplete">{days(chart.incompleteDays)} sem dados de alguma assinatura: o uso dela nesses dias contou 0 na soma.</p>}
            {shared.map((group) => (
                <p key={group.join("|")} data-go-note="shared">
                    As chaves {names(group)} leem a mesma assinatura: contadas uma vez na soma.
                </p>
            ))}
            {cycleNote && (
                <p data-go-note="cycle">
                    As assinaturas têm ciclos diferentes: o gráfico e a previsão seguem o ciclo da chave {cycleNote} (renovação mais próxima).
                </p>
            )}
        </div>
    )
}
