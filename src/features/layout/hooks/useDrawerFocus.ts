"use client"

import { useEffect, type RefObject } from "react"

/**
 * Comportamento da gaveta do menu (padrão Sidebar do DS Sipal): ao abrir, o foco vai para o
 * primeiro link do menu e Esc passa a fechar (`onEscape`). A volta do foco para o botão de menu
 * fica com quem fecha (Esc, fundo, "Fechar menu"); ao escolher um link, a navegação leva o foco.
 */
export function useDrawerFocus(open: boolean, onEscape: () => void, drawerRef: RefObject<HTMLElement | null>) {
    useEffect(() => {
        if (!open) return
        const frame = requestAnimationFrame(() => drawerRef.current?.querySelector<HTMLElement>("nav a, nav button")?.focus())
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onEscape()
        }
        document.addEventListener("keydown", onKey)
        return () => {
            cancelAnimationFrame(frame)
            document.removeEventListener("keydown", onKey)
        }
    }, [open, onEscape, drawerRef])
}
