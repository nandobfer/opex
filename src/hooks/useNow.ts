"use client"

import { useEffect, useState } from "react"

/** Instante atual, atualizado a cada `intervalMs` enquanto `active` (contagens regressivas). */
export function useNow(intervalMs = 1000, active = true): number {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        if (!active) return
        const timer = setInterval(() => setNow(Date.now()), intervalMs)
        return () => clearInterval(timer)
    }, [intervalMs, active])
    return now
}

/** `mm:ss` de uma duração em milissegundos (negativa vira `00:00`). */
export function formatCountdown(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000))
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}
