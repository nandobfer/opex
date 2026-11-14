"use client"

import { useEffect, useState } from "react"
import { useCompactWorkbench } from "./useCompactWorkbench"

/** Diferença mínima entre a janela e a área visível para contar como teclado (barras do navegador ficam abaixo disso). */
export const KEYBOARD_MIN_INSET = 120

/**
 * Altura coberta pelo teclado virtual: a janela (`innerHeight`) menos a área visível (`visualViewport`),
 * descontado o deslocamento da área visível. Diferenças pequenas (barra de endereço que some) não contam.
 */
export function keyboardInset(windowHeight: number, visualHeight: number, visualOffsetTop = 0): number {
    const inset = Math.round(windowHeight - visualHeight - visualOffsetTop)
    return inset >= KEYBOARD_MIN_INSET ? inset : 0
}

/**
 * Celular (`< lg`, OPE-166): quanto o teclado virtual cobre da tela. A altura da central vem do `<main>`
 * (`useScrollViewportHeight`), que não muda com o teclado no iOS; descontar este valor mantém o campo de
 * texto e o dock da mesa acima do teclado. `0` no desktop, sem `visualViewport` ou sem teclado.
 */
export function useKeyboardInset(enabled = true): number {
    const compact = useCompactWorkbench()
    const active = enabled && compact
    const [inset, setInset] = useState(0)
    useEffect(() => {
        const viewport = typeof window === "undefined" ? undefined : window.visualViewport
        if (!active || !viewport) return
        const update = () => setInset(keyboardInset(window.innerHeight, viewport.height, viewport.offsetTop))
        update()
        viewport.addEventListener("resize", update)
        viewport.addEventListener("scroll", update)
        return () => {
            viewport.removeEventListener("resize", update)
            viewport.removeEventListener("scroll", update)
        }
    }, [active])
    return active ? inset : 0
}
