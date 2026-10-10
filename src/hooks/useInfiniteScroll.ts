"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getAppScrollContainer } from "@/hooks/usePageVirtualizer"

interface UseInfiniteScrollOptions {
    /** Chamado quando o sentinel entra na área visível e não está bloqueado. */
    onLoadMore: () => void
    /** Bloqueia novos disparos (carregando, sem próxima página ou erro na próxima página). */
    disabled?: boolean
    /** Distância antes do fim em que a próxima página começa a carregar (default `200px`). */
    rootMargin?: string
}

interface UseInfiniteScrollResult {
    /**
     * Prenda no elemento sentinel no fim da lista (`<div ref={sentinelRef} />`). É um callback ref:
     * o observer é criado quando o sentinel entra no DOM (a lista só monta após carregar) e destruído
     * quando ele sai.
     */
    sentinelRef: (node: HTMLDivElement | null) => void
    /** `false` quando o ambiente não tem `IntersectionObserver` (use um botão manual como fallback). */
    supported: boolean
}

/**
 * Infinite scrolling para listas paginadas: observa um elemento sentinel no fim da lista e chama
 * `onLoadMore` quando ele entra na área de rolagem do app (`#main-content`). Como o
 * `IntersectionObserver` não reemite sem mudança de interseção, ao liberar `disabled` o hook
 * redispara se o sentinel continuar visível — assim a lista segue carregando até preencher a tela.
 */
export function useInfiniteScroll({ onLoadMore, disabled = false, rootMargin = "200px" }: UseInfiniteScrollOptions): UseInfiniteScrollResult {
    const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null)
    const onLoadMoreRef = useRef(onLoadMore)
    const disabledRef = useRef(disabled)
    const intersectingRef = useRef(false)

    useEffect(() => {
        onLoadMoreRef.current = onLoadMore
    }, [onLoadMore])

    const sentinelRef = useCallback((node: HTMLDivElement | null) => setSentinel(node), [])

    useEffect(() => {
        if (!sentinel || typeof IntersectionObserver === "undefined") return
        intersectingRef.current = false
        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[entries.length - 1]
                intersectingRef.current = entry?.isIntersecting ?? false
                if (entry?.isIntersecting && !disabledRef.current) onLoadMoreRef.current()
            },
            { root: getAppScrollContainer(), rootMargin },
        )
        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [sentinel, rootMargin])

    // O observer não reemite sem mudança de interseção: ao terminar o carregamento (`disabled` volta a
    // `false`) com o sentinel ainda visível, dispara de novo.
    useEffect(() => {
        disabledRef.current = disabled
        if (!disabled && intersectingRef.current) onLoadMoreRef.current()
    }, [disabled])

    return { sentinelRef, supported: typeof IntersectionObserver !== "undefined" }
}
