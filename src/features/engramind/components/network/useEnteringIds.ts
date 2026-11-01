"use client"

import { useEffect, useRef, useState } from "react"

/** Duração do nascimento de uma memória nova (partícula + link). */
export const ENTER_MS = 600

/**
 * Ids que acabaram de chegar ao universo (memória criada ou movida para cá depois da primeira
 * carga): ficam marcados por `ENTER_MS` para o nascimento animado. A primeira leitura não conta.
 * `isProvisional`: uma memória provisória da lista otimista (`pendente-…`) que vira a definitiva já
 * nasceu, e a definitiva herda o estado em vez de nascer de novo.
 */
export function useEnteringIds(ids: readonly string[], options: { isProvisional?: (id: string) => boolean; onEnter?: (ids: string[]) => void } = {}): ReadonlySet<string> {
    const known = useRef<Set<string> | null>(null)
    const previous = useRef<readonly string[]>([])
    const timers = useRef<ReturnType<typeof setTimeout>[]>([])
    const optionsRef = useRef(options)
    const [entering, setEntering] = useState<ReadonlySet<string>>(() => new Set())

    useEffect(() => {
        optionsRef.current = options
    })
    useEffect(() => {
        const pending = timers.current
        return () => pending.forEach(clearTimeout)
    }, [])

    useEffect(() => {
        const before = previous.current
        previous.current = ids
        if (known.current === null) {
            known.current = new Set(ids)
            return
        }
        const seen = known.current
        let fresh = ids.filter((id) => !seen.has(id))
        for (const id of ids) seen.add(id)
        const { isProvisional, onEnter } = optionsRef.current
        if (isProvisional) {
            const current = new Set(ids)
            const resolved = before.filter((id) => isProvisional(id) && !current.has(id)).length
            fresh = fresh.slice(resolved)
        }
        if (!fresh.length) return
        onEnter?.(fresh)
        setEntering((set) => new Set([...set, ...fresh]))
        timers.current.push(
            setTimeout(() => {
                setEntering((set) => {
                    const next = new Set(set)
                    for (const id of fresh) next.delete(id)
                    return next
                })
            }, ENTER_MS),
        )
    }, [ids])

    return entering
}
