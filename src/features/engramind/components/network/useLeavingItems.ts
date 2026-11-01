"use client"

import { useEffect, useRef, useState } from "react"

export const LEAVE_MS = 260

/**
 * Mantém por um instante os itens que saíram da lista (marcados `leaving`) para a animação de
 * saída das partículas; o React Flow removeria o node na hora.
 */
export function useLeavingItems<T extends { id: string }>(items: readonly T[]): { items: (T & { leaving?: boolean })[]; removed: string[] } {
    const previous = useRef<Map<string, T>>(new Map())
    const [leaving, setLeaving] = useState<Map<string, T>>(new Map())
    const [removed, setRemoved] = useState<string[]>([])
    useEffect(() => {
        const current = new Map(items.map((item) => [item.id, item]))
        const gone = [...previous.current.values()].filter((item) => !current.has(item.id))
        previous.current = current
        if (!gone.length) return
        setRemoved(gone.map((item) => item.id))
        setLeaving((map) => new Map([...map, ...gone.map((item) => [item.id, item] as const)]))
        const timer = setTimeout(() => setLeaving((map) => new Map([...map].filter(([id]) => !gone.some((item) => item.id === id)))), LEAVE_MS)
        return () => clearTimeout(timer)
    }, [items])
    const present = new Set(items.map((item) => item.id))
    return { items: [...items, ...[...leaving.values()].filter((item) => !present.has(item.id)).map((item) => ({ ...item, leaving: true }))], removed }
}
