"use client"

import { useCallback, useSyncExternalStore } from "react"

/** Um relógio por intervalo, compartilhado por quem o assina; o intervalo para sem assinantes. */
interface Ticker {
    current: number
    listeners: Set<() => void>
    timer: ReturnType<typeof setInterval> | null
}

const tickers = new Map<number, Ticker>()

function tickerFor(intervalMs: number): Ticker {
    let ticker = tickers.get(intervalMs)
    if (!ticker) {
        ticker = { current: Date.now(), listeners: new Set(), timer: null }
        tickers.set(intervalMs, ticker)
    }
    return ticker
}

function subscribeTicker(intervalMs: number, listener: () => void): () => void {
    const ticker = tickerFor(intervalMs)
    ticker.listeners.add(listener)
    if (!ticker.timer) {
        ticker.current = Date.now()
        ticker.timer = setInterval(() => {
            ticker.current = Date.now()
            for (const notify of ticker.listeners) notify()
        }, intervalMs)
    }
    return () => {
        ticker.listeners.delete(listener)
        if (ticker.listeners.size) return
        if (ticker.timer) clearInterval(ticker.timer)
        ticker.timer = null
        // Sem assinantes, sai do mapa: a próxima montagem começa do instante atual, não de um valor parado.
        if (tickers.get(intervalMs) === ticker) tickers.delete(intervalMs)
    }
}

const serverSnapshot = () => null

/**
 * Instante atual por `useSyncExternalStore`, redesenhado a cada `intervalMs` enquanto `active`.
 * `null` no servidor e na hidratação ("ainda não pronto"); quem exibe tempo deriva de um carimbo
 * (`agora − início`), nunca acumula por tick. Use um intervalo menor que a unidade exibida.
 */
export function useTickingNow(intervalMs = 250, active = true): number | null {
    const subscribe = useCallback((listener: () => void) => (active ? subscribeTicker(intervalMs, listener) : () => {}), [intervalMs, active])
    const getSnapshot = useCallback(() => (active ? tickerFor(intervalMs).current : null), [intervalMs, active])
    return useSyncExternalStore(subscribe, getSnapshot, serverSnapshot)
}
