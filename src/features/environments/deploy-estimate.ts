import type { DeployKind } from "./types"

/**
 * Estimativa da duração de um deploy pelos deploys anteriores com sucesso do mesmo ambiente (OPE-202).
 * Módulo puro: a consulta fica em `server/estimate.ts`.
 */

/** Quantos deploys recentes entram na mediana. */
export const DEPLOY_ESTIMATE_WINDOW = 10
/** Abaixo disso a estimativa é "inicial" (ou cai do mesmo tipo para qualquer tipo). */
export const DEPLOY_ESTIMATE_MIN_SAMPLES = 3

export interface DeploySample {
    kind: DeployKind
    durationMs: number
}

export interface DeployEstimate {
    estimateMs: number | null
    sampleSize: number
    /** `kind`: só o mesmo tipo; `environment`: qualquer tipo do ambiente. */
    basis: "kind" | "environment" | null
    /** Menos amostras que o mínimo: o texto avisa que é uma estimativa inicial. */
    initial: boolean
}

export const NO_DEPLOY_ESTIMATE: DeployEstimate = { estimateMs: null, sampleSize: 0, basis: null, initial: false }

export function median(values: readonly number[]): number | null {
    if (!values.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

/**
 * `samples` do mais recente ao mais antigo. Mesmo tipo com amostra suficiente → qualquer tipo do
 * ambiente com amostra suficiente → as poucas que houver (inicial) → sem estimativa.
 */
export function estimateDeployDuration(samples: readonly DeploySample[], kind: DeployKind): DeployEstimate {
    const valid = samples.filter((sample) => Number.isFinite(sample.durationMs) && sample.durationMs > 0)
    const sameKind = valid.filter((sample) => sample.kind === kind).slice(0, DEPLOY_ESTIMATE_WINDOW)
    const pick = (list: readonly DeploySample[], basis: DeployEstimate["basis"], initial: boolean): DeployEstimate => ({
        estimateMs: Math.round(median(list.map((sample) => sample.durationMs))!),
        sampleSize: list.length,
        basis,
        initial,
    })
    if (sameKind.length >= DEPLOY_ESTIMATE_MIN_SAMPLES) return pick(sameKind, "kind", false)
    const any = valid.slice(0, DEPLOY_ESTIMATE_WINDOW)
    if (!any.length) return NO_DEPLOY_ESTIMATE
    return pick(any, "environment", any.length < DEPLOY_ESTIMATE_MIN_SAMPLES)
}
