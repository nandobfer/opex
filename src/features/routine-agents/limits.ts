import { DEFAULT_LIVE_WAIT_MINUTES } from "./constants"
import type { RoutineLimits } from "./schemas"

/**
 * Limites de uma execução (OPE-130, módulo PURO). Vazio = sem limite.
 *
 * Decisões do plano aprovado da OPE-130:
 * - **D1**: o "Custo máximo por execução (USD)" virou **"Máximo de tokens por execução"** — os
 *   provedores diretos não informam custo, então o limite de custo não teria garantia. O teto de
 *   tokens vale nos dois motores e é conferido a cada passo; o custo continua só informativo.
 * - **D3**: o **tempo ativo** conta Executando + Esperando (turno vivo). Hibernada e Aguardando
 *   confirmação contam no **tempo máximo total esperando**, que ao estourar expira a execução.
 */

export interface RunUsage {
    /** Tempo de turno vivo acumulado (Executando + Esperando), em ms. */
    activeMs: number
    /** Tempo hibernada ou aguardando confirmação acumulado, em ms. */
    waitingMs: number
    tokens: number
}

export type LimitVerdict = { kind: "ok" } | { kind: "error"; code: "TOKENS" | "ACTIVE"; message: string } | { kind: "expired"; message: string }

export const TOKEN_LIMIT_MESSAGE = "Limite de tokens atingido"
export const ACTIVE_LIMIT_MESSAGE = "Tempo máximo de execução ativa atingido"
/**
 * Teto técnico de um turno (vale nos dois motores, com ou sem "Tempo máximo ativo"): um provedor ou
 * uma ferramenta pendurados não seguram a vaga para sempre.
 */
export const ROUTINE_TURN_TIMEOUT_MS = 6 * 3_600_000
export const TURN_TIMEOUT_MESSAGE = "O turno passou do teto técnico de 6 h sem terminar (provedor ou ferramenta sem resposta)"
/** Depois de interromper, quanto esperar o motor parar antes de fechar o turno mesmo assim. */
export const ROUTINE_STOP_GRACE_MS = 15_000
export const WAITING_LIMIT_MESSAGE = "Tempo máximo total esperando atingido"

/** Confere os limites de uma execução no passo atual (turno vivo) ou na espera (hibernada/confirmação). */
export function checkRunLimits(usage: RunUsage, limits: RoutineLimits, phase: "active" | "parked"): LimitVerdict {
    if (phase === "active") {
        if (limits.maxTokens !== null && usage.tokens >= limits.maxTokens) return { kind: "error", code: "TOKENS", message: TOKEN_LIMIT_MESSAGE }
        if (limits.maxActiveMinutes !== null && usage.activeMs >= limits.maxActiveMinutes * 60_000) return { kind: "error", code: "ACTIVE", message: ACTIVE_LIMIT_MESSAGE }
        return { kind: "ok" }
    }
    if (limits.maxWaitingMinutes !== null && usage.waitingMs >= limits.maxWaitingMinutes * 60_000) return { kind: "expired", message: WAITING_LIMIT_MESSAGE }
    return { kind: "ok" }
}

/** Espera viva máxima (sem valor: 10 min), em ms. */
export const liveWaitBudgetMs = (limits: Pick<RoutineLimits, "maxLiveWaitMinutes">) => (limits.maxLiveWaitMinutes ?? DEFAULT_LIVE_WAIT_MINUTES) * 60_000

/** Quanto tempo ativo ainda resta (`null` = sem limite). */
export const remainingActiveMs = (usage: Pick<RunUsage, "activeMs">, limits: Pick<RoutineLimits, "maxActiveMinutes">) =>
    limits.maxActiveMinutes === null ? null : Math.max(0, limits.maxActiveMinutes * 60_000 - usage.activeMs)

/** Quanto da espera viva ainda resta nesta ativação. */
export const remainingLiveWaitMs = (liveWaitMs: number, limits: Pick<RoutineLimits, "maxLiveWaitMinutes">) => Math.max(0, liveWaitBudgetMs(limits) - liveWaitMs)

/** Horário em que uma execução parada expira (`null` = sem limite). */
export function parkedExpiresAt(waitingMs: number, parkedSince: Date, limits: Pick<RoutineLimits, "maxWaitingMinutes">): Date | null {
    if (limits.maxWaitingMinutes === null) return null
    return new Date(parkedSince.getTime() + Math.max(0, limits.maxWaitingMinutes * 60_000 - waitingMs))
}
