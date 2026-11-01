"use client"

import { useEffect, useMemo, useRef, useState } from "react"

export const LEAVE_MS = 260

/**
 * Mantém por um instante os itens que saíram da lista (marcados `leaving`) para a animação de
 * saída das partículas; o React Flow removeria o node na hora.
 */
export function useLeavingItems<T extends { id: string }>(items: readonly T[], onRemoved?: (ids: string[]) => void): (T & { leaving?: boolean })[] {
    const previous = useRef<Map<string, T>>(new Map())
    const [leaving, setLeaving] = useState<Map<string, T>>(new Map())
    const onRemovedRef = useRef(onRemoved)
    useEffect(() => {
        onRemovedRef.current = onRemoved
    }, [onRemoved])
    // Um timer por item que sai, independente do ciclo do efeito: uma nova referência de `items`
    // dentro de `LEAVE_MS` não cancela a limpeza (senão o item ficaria "saindo" para sempre).
    const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
    useEffect(() => {
        const pending = timers.current
        return () => {
            for (const timer of pending.values()) clearTimeout(timer)
            pending.clear()
        }
    }, [])
    useEffect(() => {
        const current = new Map(items.map((item) => [item.id, item]))
        const gone = [...previous.current.values()].filter((item) => !current.has(item.id))
        previous.current = current
        if (!gone.length) return
        onRemovedRef.current?.(gone.map((item) => item.id))
        setLeaving((map) => new Map([...map, ...gone.map((item) => [item.id, item] as const)]))
        for (const item of gone) {
            const existing = timers.current.get(item.id)
            if (existing) clearTimeout(existing)
            timers.current.set(
                item.id,
                setTimeout(() => {
                    timers.current.delete(item.id)
                    setLeaving((map) => {
                        if (!map.has(item.id)) return map
                        const next = new Map(map)
                        next.delete(item.id)
                        return next
                    })
                }, LEAVE_MS),
            )
        }
    }, [items])
    // Mesma referência enquanto nada sai: o layout e os nodes só recalculam quando os dados mudam.
    return useMemo(() => {
        if (!leaving.size) return items as (T & { leaving?: boolean })[]
        const present = new Set(items.map((item) => item.id))
        return [...items, ...[...leaving.values()].filter((item) => !present.has(item.id)).map((item) => ({ ...item, leaving: true }))]
    }, [items, leaving])
}
