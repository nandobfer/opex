"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/** Distância (px) do fim considerada "colado no fim". */
const BOTTOM_THRESHOLD = 80

/**
 * Acompanha o fim de um container rolável (a saída ao vivo da mesa): enquanto o usuário não rolar
 * para cima, prende a rolagem ao fim sempre que o conteúdo cresce; ao rolar para cima, solta; ao
 * voltar ao fim (ou chamar `scrollToBottom`), volta a acompanhar.
 *
 * O componente chama `stickToBottom` depois de cada mudança de conteúdo (aqui, a cada mudança do
 * objeto `timeline`), o que cobre qualquer item que cresça — inclusive os que estão no meio da
 * lista, como o fim de um turno.
 */
export function useStickToBottom(threshold = BOTTOM_THRESHOLD) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const stickRef = useRef(true)
    const [atBottom, setAtBottom] = useState(true)

    const compute = useCallback(() => {
        const element = scrollRef.current
        if (!element) return
        const bottom = element.scrollHeight - element.scrollTop - element.clientHeight < threshold
        stickRef.current = bottom
        setAtBottom(bottom)
    }, [threshold])

    /** Prende ao fim quando o conteúdo cresce (não faz nada se o usuário rolou para cima). */
    const stickToBottom = useCallback(() => {
        const element = scrollRef.current
        if (!element || !stickRef.current) return
        element.scrollTop = element.scrollHeight
    }, [])

    /** Rola ao fim e volta a acompanhar (usado pelo botão "Ir para o final"). */
    const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
        const element = scrollRef.current
        if (!element) return
        stickRef.current = true
        setAtBottom(true)
        if (behavior === "smooth" && typeof element.scrollTo === "function") element.scrollTo({ top: element.scrollHeight, behavior })
        else element.scrollTop = element.scrollHeight
    }, [])

    useEffect(() => {
        const element = scrollRef.current
        if (!element) return
        element.addEventListener("scroll", compute, { passive: true })
        return () => element.removeEventListener("scroll", compute)
    }, [compute])

    return { scrollRef, atBottom, stickToBottom, scrollToBottom }
}
