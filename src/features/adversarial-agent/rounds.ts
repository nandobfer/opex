import type { AdversarialDecision } from "./constants"
import type { AdversarialSettings } from "./schemas"
import type { EvaluatedFinding } from "./verdict"

/**
 * Ciclos e rodadas do Agente Adversário (módulo PURO). Um ciclo começa a cada implementação nova e
 * continua enquanto a mesa corrige os bloqueios (ou o usuário pede para revisar de novo); cada
 * revisão do ciclo é uma rodada. Repetir uma rodada que falhou não conta como rodada nova.
 */

export interface RoundHistoryItem {
    cycle: number
    round: number
    decision: AdversarialDecision | null
}

/** Decisões que continuam o ciclo (a próxima revisão é a rodada seguinte). */
const CONTINUES: readonly AdversarialDecision[] = ["fix-auto", "fix-user", "rerun", "awaiting"]
/** Rodada que não terminou: o "Tentar novamente" repete a mesma rodada. */
const RETRIES: readonly AdversarialDecision[] = ["failed", "interrupted"]

export interface RoundPlan {
    cycle: number
    round: number
    /** Índice (em `history`, mais nova primeiro) da rodada anterior do mesmo ciclo; `null` na 1ª. */
    previousIndex: number | null
}

export function planRound(history: readonly RoundHistoryItem[]): RoundPlan {
    const latest = history[0]
    if (!latest) return { cycle: 1, round: 1, previousIndex: null }
    if (latest.decision && RETRIES.includes(latest.decision)) {
        const before = history[1]
        return { cycle: latest.cycle, round: latest.round, previousIndex: before && before.cycle === latest.cycle ? 1 : null }
    }
    if (latest.decision && CONTINUES.includes(latest.decision)) return { cycle: latest.cycle, round: latest.round + 1, previousIndex: 0 }
    return { cycle: latest.cycle + 1, round: 1, previousIndex: null }
}

export type RoundOutcome =
    | { kind: "approved"; decision: "approved" }
    | { kind: "fix"; decision: "fix-auto" }
    | { kind: "blocked"; decision: "awaiting"; limitReached: boolean }
    | { kind: "proceed"; decision: "proceeded-limit" }

/** O que fazer depois de uma rodada concluída, conforme os bloqueios e a configuração. */
export function decideRound(findings: readonly Pick<EvaluatedFinding, "blocking">[], round: number, settings: Pick<AdversarialSettings, "correction" | "rounds">): RoundOutcome {
    if (!findings.some((finding) => finding.blocking)) return { kind: "approved", decision: "approved" }
    if (settings.correction === "confirm") return { kind: "blocked", decision: "awaiting", limitReached: false }
    if (settings.rounds.limited && round >= settings.rounds.max) {
        return settings.rounds.onLimit === "pause" ? { kind: "blocked", decision: "awaiting", limitReached: true } : { kind: "proceed", decision: "proceeded-limit" }
    }
    return { kind: "fix", decision: "fix-auto" }
}

/** Achados que vão ao implementador: os bloqueantes, menos os desmarcados pelo usuário. */
export function findingsToFix<T extends Pick<EvaluatedFinding, "id" | "blocking">>(findings: readonly T[], excluded: readonly string[] = []): T[] {
    const skip = new Set(excluded)
    return findings.filter((finding) => finding.blocking && !skip.has(finding.id))
}
