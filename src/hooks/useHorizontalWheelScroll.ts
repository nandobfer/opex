"use client"

import { useEffect, type RefObject } from "react"

/** Altura de uma linha de texto, usada quando o navegador informa a roda em linhas (`deltaMode` 1). */
const LINE_HEIGHT_PX = 16
/** Tolerância (px) para considerar a faixa já no início ou no fim. */
const EDGE_TOLERANCE_PX = 1

export interface HorizontalWheelInput {
    /** Deslocamento horizontal informado pela roda (trackpad já preenche este valor). */
    deltaX: number
    /** Deslocamento vertical informado pela roda. */
    deltaY: number
    /** Unidade do evento (`0` pixel, `1` linha, `2` página). */
    deltaMode: number
    /** Shift pressionado: o navegador já converte a roda vertical em rolagem horizontal. */
    shiftKey: boolean
    /** Ctrl pressionado (zoom do navegador ou pinça do trackpad): não sequestrar o gesto. */
    ctrlKey?: boolean
    scrollLeft: number
    scrollWidth: number
    clientWidth: number
}

/**
 * Decide a rolagem horizontal que a roda vertical deve produzir numa faixa de abas.
 * Devolve o deslocamento em pixels ou `null` para deixar o navegador agir (Shift, Ctrl/zoom, trackpad,
 * faixa sem overflow, faixa já no fim na direção do gesto — a roda segue rolando a página).
 */
export function resolveHorizontalWheel({ deltaX, deltaY, deltaMode, shiftKey, ctrlKey = false, scrollLeft, scrollWidth, clientWidth }: HorizontalWheelInput): number | null {
    if (shiftKey || ctrlKey) return null
    if (Math.abs(deltaX) >= Math.abs(deltaY)) return null
    if (scrollWidth <= clientWidth + EDGE_TOLERANCE_PX) return null

    const step = deltaMode === 1 ? deltaY * LINE_HEIGHT_PX : deltaMode === 2 ? deltaY * clientWidth : deltaY
    if (step === 0) return null

    const maxScrollLeft = scrollWidth - clientWidth
    if (step < 0 && scrollLeft <= EDGE_TOLERANCE_PX) return null
    if (step > 0 && scrollLeft >= maxScrollLeft - EDGE_TOLERANCE_PX) return null

    return step
}

/**
 * Converte a roda vertical do mouse em rolagem horizontal numa faixa com `overflow-x`.
 * O ouvinte é registrado direto no elemento (não pelo `onWheel` do React, passivo) para poder
 * chamar `preventDefault`; a rolagem vai em passos do próprio evento, sem animação.
 */
export function useHorizontalWheelScroll(ref: RefObject<HTMLElement | null>) {
    useEffect(() => {
        const element = ref.current
        if (!element) return

        const onWheel = (event: WheelEvent) => {
            const step = resolveHorizontalWheel({
                deltaX: event.deltaX,
                deltaY: event.deltaY,
                deltaMode: event.deltaMode,
                shiftKey: event.shiftKey,
                ctrlKey: event.ctrlKey,
                scrollLeft: element.scrollLeft,
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth,
            })
            if (step === null) return
            event.preventDefault()
            element.scrollLeft += step
        }

        element.addEventListener("wheel", onWheel, { passive: false })
        return () => element.removeEventListener("wheel", onWheel)
    }, [ref])
}
