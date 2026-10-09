"use client"

import { useCallback, useEffect, useState } from "react"
import { BREAKPOINTS } from "@/lib/ui/breakpoints"

const STORAGE_KEY = "opex-sidebar-collapsed"

/**
 * Estado da sidebar: recolhida (desktop, persistida) e aberta como gaveta (mobile).
 * Em tela estreita o menu nunca expande em linha: vira gaveta sobre o conteúdo.
 *
 * `autoCollapse` (FR-043, ex.: atendimento): o menu recolhe ao entrar na página e a escolha
 * manual do usuário vale só até sair dela (não é persistida nem altera a preferência salva).
 */
export function useSidebarState(autoCollapse = false) {
    const [collapsed, setCollapsed] = useState(false)
    const [override, setOverride] = useState<boolean | null>(null)
    const [lastAutoCollapse, setLastAutoCollapse] = useState(autoCollapse)
    if (lastAutoCollapse !== autoCollapse) {
        // Troca de página: a escolha manual da página anterior deixa de valer.
        setLastAutoCollapse(autoCollapse)
        setOverride(null)
    }
    const [mobileOpen, setMobileOpen] = useState(false)
    const [isDesktop, setIsDesktop] = useState(true)

    useEffect(() => {
        const stored = window.localStorage.getItem(STORAGE_KEY) === "1"
        const onResize = () => setIsDesktop(window.innerWidth >= BREAKPOINTS.desktop)
        onResize()
        queueMicrotask(() => setCollapsed(stored))
        window.addEventListener("resize", onResize)
        return () => window.removeEventListener("resize", onResize)
    }, [])

    const effective = autoCollapse ? (override ?? true) : collapsed

    const toggleCollapsed = useCallback(() => {
        if (autoCollapse) {
            setOverride((current) => !(current ?? true))
            return
        }
        setCollapsed((current) => {
            const next = !current
            try {
                window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
            } catch {
                // Preferência visual: storage indisponível não impede a navegação.
            }
            return next
        })
    }, [autoCollapse])

    return {
        collapsed: isDesktop && effective,
        isDesktop,
        mobileOpen,
        toggleCollapsed,
        openMobile: useCallback(() => setMobileOpen(true), []),
        closeMobile: useCallback(() => setMobileOpen(false), []),
    }
}
