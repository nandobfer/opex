"use client"

import { useCallback, useEffect, useState } from "react"
import { BREAKPOINTS } from "@/lib/ui/breakpoints"

/**
 * Estado da sidebar: no desktop ela é **sempre recolhida** (68px, sem recolher/expandir); em tela
 * estreita o menu vira uma gaveta sobre o conteúdo, aberta pelo botão flutuante e fechada por
 * Esc/fundo/link.
 */
export function useSidebarState() {
    const [mobileOpen, setMobileOpen] = useState(false)
    const [isDesktop, setIsDesktop] = useState(true)

    useEffect(() => {
        const onResize = () => setIsDesktop(window.innerWidth >= BREAKPOINTS.desktop)
        onResize()
        window.addEventListener("resize", onResize)
        return () => window.removeEventListener("resize", onResize)
    }, [])

    return {
        collapsed: isDesktop,
        isDesktop,
        mobileOpen,
        openMobile: useCallback(() => setMobileOpen(true), []),
        closeMobile: useCallback(() => setMobileOpen(false), []),
    }
}
