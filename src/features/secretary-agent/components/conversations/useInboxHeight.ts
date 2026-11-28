"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { INBOX_HEIGHT, INBOX_MEASURED_HEIGHT, INBOX_MIN_HEIGHT_PX } from "./chat-layout"

/** Tempo para a entrada animada da aba (≈200 ms, deslocamento vertical) terminar antes da medida final. */
export const INBOX_SETTLE_MS = 350

function scrollParentOf(element: HTMLElement): HTMLElement | null {
    let node = element.parentElement
    while (node) {
        const { overflowY } = getComputedStyle(node)
        if (overflowY === "auto" || overflowY === "scroll") return node
        node = node.parentElement
    }
    return null
}

/**
 * Altura do card da aba Conversas (OPE-207): o restante da área visível do `<main>` rolável a partir do topo do card,
 * seja qual for o que fica acima (cabeçalho da página do agente ou de Integrações › IA), no padrão do
 * `useFillViewportHeight` da central de integrações (mínimo de 480 px; abaixo disso a página rola). Mede de novo ao
 * redimensionar, quando o que fica acima muda de altura e depois da entrada animada da aba (o deslocamento não muda
 * tamanho e deixaria a primeira medida curta). Usada pelo inbox, pelo skeleton e pelo erro: os três com a mesma altura.
 */
export function useInboxHeight<T extends HTMLElement = HTMLDivElement>() {
    const ref = useRef<T>(null)
    const [height, setHeight] = useState<number>()

    useEffect(() => {
        const element = ref.current
        const container = element && scrollParentOf(element)
        if (!element || !container || typeof ResizeObserver === "undefined") return
        const compute = () => {
            const style = getComputedStyle(container)
            const paddingTop = parseFloat(style.paddingTop) || 0
            const visible = container.clientHeight - paddingTop - (parseFloat(style.paddingBottom) || 0)
            // Topo do card dentro do conteúdo (independe da rolagem).
            const offset = element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - paddingTop
            setHeight(Math.max(INBOX_MIN_HEIGHT_PX, Math.round(visible - offset)))
        }
        const observer = new ResizeObserver(compute)
        observer.observe(container)
        if (container.firstElementChild) observer.observe(container.firstElementChild)
        compute()
        const settle = window.setTimeout(compute, INBOX_SETTLE_MS)
        window.addEventListener("resize", compute)
        return () => {
            observer.disconnect()
            window.clearTimeout(settle)
            window.removeEventListener("resize", compute)
        }
    }, [])

    const style: CSSProperties | undefined = height === undefined ? undefined : { height }
    return { ref, style, className: height === undefined ? INBOX_HEIGHT : INBOX_MEASURED_HEIGHT }
}
