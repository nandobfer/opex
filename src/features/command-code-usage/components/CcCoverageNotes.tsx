import type { CycleChartDto } from "@/features/subscription-usage/types"
import type { CcKeyScopeDto } from "../types"

const days = (count: number) => (count === 1 ? "1 dia" : `${count} dias`)

const names = (list: readonly string[]) => (list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} e ${list.at(-1)}`)

function sharedKeyGroups(scope: CcKeyScopeDto | null): string[][] {
    if (!scope) return []
    const groups = new Map<number, string[]>()
    for (const key of scope.keys) groups.set(key.account, [...(groups.get(key.account) ?? []), key.name])
    return [...groups.values()].filter((list) => list.length > 1)
}

/**
 * Avisos discretos de cobertura do ciclo do Command Code: dias sem dados (contam 0), dias com leitura inconsistente
 * (consumo entre duas leituras), dias sem dados de alguma conta, chaves da mesma conta e de qual chave é o ciclo.
 */
export function CcCoverageNotes({ chart, scope }: { chart: CycleChartDto | null; scope: CcKeyScopeDto | null }) {
    const shared = sharedKeyGroups(scope)
    const cycleNote = scope?.cyclesDiffer && scope.cycleKeyName ? scope.cycleKeyName : null
    const missing = chart?.missingDays ?? 0
    const partial = chart?.partialDays ?? 0
    const incomplete = chart?.incompleteDays ?? 0
    if (!missing && !partial && !incomplete && !shared.length && !cycleNote) return null
    return (
        <div className="space-y-0.5 text-xs text-muted-foreground" role="note">
            {missing > 0 && <p data-cc-note="missing">Acumulado parcial: {days(missing)} do ciclo sem dados da API da CLI, contados como 0.</p>}
            {partial > 0 && <p data-cc-note="partial">{days(partial)} com consumo entre duas leituras: o uso desse dia contou 0 e entra no dia seguinte.</p>}
            {incomplete > 0 && <p data-cc-note="incomplete">{days(incomplete)} sem dados de alguma conta: o uso dela nesses dias contou 0 na soma.</p>}
            {shared.map((group) => (
                <p key={group.join("|")} data-cc-note="shared">
                    As chaves {names(group)} são da mesma conta: contadas uma vez na soma.
                </p>
            ))}
            {cycleNote && <p data-cc-note="cycle">As contas têm ciclos diferentes: o gráfico e a previsão seguem o ciclo da chave {cycleNote} (renovação mais próxima).</p>}
        </div>
    )
}
