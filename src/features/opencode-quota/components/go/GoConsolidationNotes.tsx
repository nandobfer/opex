import type { OpencodeGoUsageDto } from "../../go-types"

/** Rótulo do consolidado ("Todas as chaves"): "3 chaves (consolidado)". */
export function goKeysLabel(count: number): string {
    return `${count === 1 ? "1 chave" : `${count} chaves`} (consolidado)`
}

/**
 * Avisos do consolidado (OPE-180): chaves que não responderam (fora dos medidores e do gasto), o ciclo de referência
 * quando as chaves renovam em datas diferentes e as chaves sem gasto real lido. Nada aparece no caso comum.
 */
export function GoConsolidationNotes({ data }: { data: OpencodeGoUsageDto }) {
    const failed = data.keys.filter((key) => key.error)
    const noCost = data.keys.filter((key) => !key.error && !key.cost)
    const showCost = noCost.length > 0 && data.realCostUsd !== null
    if (!failed.length && !data.cycleKeyName && !showCost) return null
    return (
        <div className="space-y-0.5 text-xs text-muted-foreground" role="note">
            {failed.length > 0 && (
                <p data-go-note="partial-keys" className="text-warning">
                    Consolidado parcial: {failed.length} de {data.keys.length} chaves não responderam ({failed.map((key) => key.name).join(", ")}). Os medidores e o gasto somam só as que responderam.
                </p>
            )}
            {data.cycleKeyName && <p data-go-note="cycle">Ciclo e previsão pela chave {data.cycleKeyName}, a de maior cota mensal; as demais renovam em outras datas.</p>}
            {showCost && <p data-go-note="cost">Gasto real parcial: {noCost.map((key) => key.name).join(", ")} sem leitura de custo no ciclo.</p>}
        </div>
    )
}
