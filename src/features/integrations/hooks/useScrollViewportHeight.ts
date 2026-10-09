"use client"

import { useEffect, useState, type RefObject } from "react"

/** Ancestral rolável mais próximo (no dashboard, o `<main>` do `DashboardShell`). */
export function findScrollParent(element: HTMLElement | null): HTMLElement | null {
    let node = element?.parentElement ?? null
    while (node) {
        const { overflowY } = getComputedStyle(node)
        if (overflowY === "auto" || overflowY === "scroll") return node
        node = node.parentElement
    }
    return null
}

/** Altura visível do contêiner rolável descontando o padding vertical dele. */
export function visibleContentHeight(container: HTMLElement): number {
    const style = getComputedStyle(container)
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
    return Math.max(0, container.clientHeight - padding)
}

/**
 * Altura exata da área visível do contêiner rolável que envolve `ref` — acompanha resize da
 * janela e a entrada/saída dos tickers (via `ResizeObserver`). `undefined` até medir.
 */
export function useScrollViewportHeight(ref: RefObject<HTMLElement | null>, enabled = true): number | undefined {
    const [height, setHeight] = useState<number>()

    useEffect(() => {
        if (!enabled) return
        const container = findScrollParent(ref.current)
        if (!container) return

        if (typeof ResizeObserver === "undefined") return
        // O `ResizeObserver` dispara uma vez ao observar: é a medição inicial.
        const observer = new ResizeObserver(() => setHeight(visibleContentHeight(container)))
        observer.observe(container)
        return () => observer.disconnect()
    }, [ref, enabled])

    return enabled ? height : undefined
}
