"use client"

import { useMemo, useState } from "react"
import type { Edge, Node } from "@xyflow/react"

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype

/** Igualdade rasa; com `depth > 0`, objetos simples dentro também são comparados raso a raso. */
export function shallowEqualDeep(a: unknown, b: unknown, depth = 1): boolean {
    if (Object.is(a, b)) return true
    if (!isPlainObject(a) || !isPlainObject(b)) return false
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    return keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && (depth > 0 ? shallowEqualDeep(a[key], b[key], depth - 1) : Object.is(a[key], b[key])))
}

/**
 * Reaproveita o objeto anterior de cada node (ou aresta) quando nada dele mudou (OPE-113). O React Flow
 * trata objeto novo como node ainda não medido: zera a medida e o esconde até medir de novo, o que
 * aparece como piscada. Hover, foco e card aberto chegam por contexto, nunca pelo array.
 */
export function useStable<T extends Node | Edge>(items: T[], depth = 3): T[] {
    // Cache mutável e estável (o objeto do estado nunca é trocado): o último objeto entregue por id.
    const [cache] = useState(() => new Map<string, T>())
    return useMemo(() => {
        const seen = new Set<string>()
        const result = items.map((item) => {
            seen.add(item.id)
            const old = cache.get(item.id)
            if (old && shallowEqualDeep(old, item, depth)) return old
            cache.set(item.id, item)
            return item
        })
        for (const id of [...cache.keys()]) if (!seen.has(id)) cache.delete(id)
        return result
    }, [items, cache, depth])
}
