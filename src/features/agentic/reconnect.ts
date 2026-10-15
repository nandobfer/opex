/**
 * Vocabulário do ciclo de reconexão ao agente (mesa de trabalho e refinamento). Módulo PURO
 * (cliente e servidor): o desfecho estável de uma tentativa e a agenda das tentativas automáticas.
 */

/**
 * Agenda das tentativas automáticas: `1s → 2s → 4s → 8s → 16s` (no máximo 5). Depois disso, só o
 * clique manual volta a tentar.
 */
export const AUTO_RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000] as const

export const RECONNECT_OUTCOMES = ["attached", "recovered", "nothing", "transient"] as const
export type ReconnectOutcome = (typeof RECONNECT_OUTCOMES)[number]

/** Registro estável do último desfecho (vai no estado da mesa/refinamento, sem depender de texto). */
export interface ReconnectInfoDto {
    outcome: ReconnectOutcome
    /** Motivo (pt-BR) quando não há execução para acompanhar; `null` nos demais desfechos. */
    message: string | null
    at: string
}

/** Valor gravado → desfecho conhecido; registro desconhecido/ausente cai em `null`. */
export function asReconnectOutcome(value: string | null | undefined): ReconnectOutcome | null {
    return (RECONNECT_OUTCOMES as readonly string[]).includes(value ?? "") ? (value as ReconnectOutcome) : null
}

/**
 * O que fazer com o desfecho de uma tentativa: `success` (o agente voltou a ser acompanhado),
 * `nothing` (resposta definitiva: não há execução para acompanhar) ou `retry` (falha transitória).
 */
export function reconnectDecision(outcome: ReconnectOutcome | null | undefined): "success" | "nothing" | "retry" {
    if (outcome === "attached" || outcome === "recovered") return "success"
    if (outcome === "nothing") return "nothing"
    return "retry"
}

export interface ReconnectCycleState {
    /** Uma série de tentativas está em andamento (indicador "Reconectando…"). */
    reconnecting: boolean
    /** As tentativas automáticas se esgotaram sem sucesso (o botão volta a ficar livre). */
    exhausted: boolean
}

export type ReconnectCycleResult = "attached" | "nothing" | "exhausted"

export interface ReconnectCycleOptions {
    /** Executa uma tentativa e devolve o desfecho observado (`null` = transitório). */
    attempt: () => Promise<ReconnectOutcome | null>
    onUpdate: (state: ReconnectCycleState) => void
    onResult: (result: ReconnectCycleResult) => void
}

export interface ReconnectCycle {
    /** Nova série de tentativas automáticas (`1s → … → 16s`). */
    start: () => void
    /** Tentativa imediata; ao falhar, a agenda recomeça do 1s com o orçamento cheio. */
    retryNow: () => void
    /** Encerra o ciclo (sem novas tentativas). */
    stop: () => void
}

/**
 * Máquina do ciclo automático (independente de React, testável com timers falsos): dispara as
 * tentativas na agenda e encerra em sucesso, resposta definitiva ou esgotamento. Uma nova série
 * invalida os resultados pendentes da anterior (geração), então uma oscilação de estado não
 * reinicia a contagem.
 */
export function createReconnectCycle(options: ReconnectCycleOptions): ReconnectCycle {
    let timer: ReturnType<typeof setTimeout> | null = null
    let generation = 0
    let stopped = false

    const update = (reconnecting: boolean, exhausted: boolean) => options.onUpdate({ reconnecting, exhausted })

    function clear(): void {
        if (timer !== null) {
            clearTimeout(timer)
            timer = null
        }
    }

    function finish(result: ReconnectCycleResult): void {
        clear()
        update(false, result === "exhausted")
        options.onResult(result)
    }

    function wait(index: number): void {
        clear()
        const gen = generation
        timer = setTimeout(() => {
            timer = null
            attempt(index, gen, false)
        }, AUTO_RECONNECT_DELAYS_MS[index]!)
    }

    function attempt(index: number, gen: number, immediate: boolean): void {
        let pending: Promise<ReconnectOutcome | null>
        try {
            // Dispara na hora (clique manual); erro síncrono conta como falha transitória.
            pending = Promise.resolve(options.attempt())
        } catch {
            pending = Promise.resolve(null)
        }
        void pending
            .then(
                (outcome) => outcome,
                () => null,
            )
            .then((outcome) => {
                if (gen !== generation || stopped) return
                const decision = reconnectDecision(outcome)
                if (decision === "success") return finish("attached")
                if (decision === "nothing") return finish("nothing")
                const next = immediate ? 0 : index + 1
                if (next >= AUTO_RECONNECT_DELAYS_MS.length) return finish("exhausted")
                wait(next)
            })
    }

    return {
        start: () => {
            generation += 1
            stopped = false
            clear()
            update(true, false)
            wait(0)
        },
        retryNow: () => {
            generation += 1
            stopped = false
            clear()
            update(true, false)
            attempt(0, generation, true)
        },
        stop: () => {
            stopped = true
            generation += 1
            clear()
            update(false, false)
        },
    }
}
