"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useMaximizedFrame } from "./useMaximizedFrame"

/**
 * Tela cheia do navegador para UM elemento (API Fullscreen, com o prefixo `webkit` do Safari). O
 * estado acompanha o evento `fullscreenchange`, então a saída pelo navegador (Esc, F11, troca de aba)
 * também é vista. Onde o navegador não tem tela cheia de elemento (ex.: iPhone) ou recusa o pedido,
 * o elemento é maximizado sobre a área de conteúdo do app (`useMaximizedFrame`), e Esc restaura.
 * Desmontar em tela cheia sai dela.
 */

type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void; webkitFullscreenEnabled?: boolean }
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }

export function fullscreenElementOf(doc: Document): Element | null {
    const fs = doc as FullscreenDocument
    return fs.fullscreenElement ?? fs.webkitFullscreenElement ?? null
}

export function fullscreenSupported(el: HTMLElement | null): boolean {
    if (!el) return false
    const doc = el.ownerDocument as FullscreenDocument
    if (doc.fullscreenEnabled === false && doc.webkitFullscreenEnabled !== true) return false
    const target = el as FullscreenElement
    return typeof target.requestFullscreen === "function" || typeof target.webkitRequestFullscreen === "function"
}

async function requestOn(el: HTMLElement): Promise<void> {
    const target = el as FullscreenElement
    if (typeof target.requestFullscreen === "function") return target.requestFullscreen()
    await target.webkitRequestFullscreen?.()
}

async function exitOn(doc: Document): Promise<void> {
    const fs = doc as FullscreenDocument
    if (typeof fs.exitFullscreen === "function") return fs.exitFullscreen()
    await fs.webkitExitFullscreen?.()
}

export interface FullscreenState {
    /** Em tela cheia (do navegador ou maximizado). */
    active: boolean
    /** Tela cheia do navegador (painéis flutuantes precisam ser desenhados dentro do elemento). */
    native: boolean
    toggle: () => void
    exit: () => void
}

export function useFullscreen(element: HTMLElement | null): FullscreenState {
    const [native, setNative] = useState(false)
    const [maximized, setMaximized] = useState(false)
    const frameRef = useMemo(() => ({ current: element }), [element])
    useMaximizedFrame(frameRef, maximized)

    useEffect(() => {
        if (!element) return
        const doc = element.ownerDocument
        const sync = () => setNative(fullscreenElementOf(doc) === element)
        doc.addEventListener("fullscreenchange", sync)
        doc.addEventListener("webkitfullscreenchange", sync)
        return () => {
            doc.removeEventListener("fullscreenchange", sync)
            doc.removeEventListener("webkitfullscreenchange", sync)
            // Trocar de aba da mesa com o diagrama em tela cheia: o navegador não fica preso nela.
            if (fullscreenElementOf(doc) === element) void exitOn(doc).catch(() => undefined)
        }
    }, [element])

    useEffect(() => {
        if (!maximized) return
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !event.defaultPrevented) setMaximized(false)
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [maximized])

    const exit = useCallback(() => {
        setMaximized(false)
        if (element && fullscreenElementOf(element.ownerDocument) === element) void exitOn(element.ownerDocument).catch(() => undefined)
    }, [element])

    const toggle = useCallback(() => {
        if (!element) return
        if (native || maximized) return exit()
        if (!fullscreenSupported(element)) return setMaximized(true)
        // Pedido recusado (permissão, iframe): cai no maximizado.
        void requestOn(element).catch(() => setMaximized(true))
    }, [element, native, maximized, exit])

    return { active: native || maximized, native, toggle, exit }
}
