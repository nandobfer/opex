"use client"

import type { ReactNode, RefObject } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Menu } from "lucide-react"
import { BrandMark } from "../BrandMark"
import type { SidebarBrand } from "../AppSidebar"
import { HEADER_LOGO_SLOT } from "../../mobile-header"
import { HeaderIconButton } from "./HeaderIconButton"
import { MobileHeaderFloatingProvider } from "./mobile-header-context"

interface MobileAppHeaderProps {
    brand: SidebarBrand
    /** Barra recolhida pela rolagem: logo, fundo e divisor saem; ficam só os botões. */
    compact: boolean
    menuButtonRef: RefObject<HTMLButtonElement | null>
    menuOpen: boolean
    drawerId: string
    onOpenMenu: () => void
    /** Atalhos alinhados à direita (ex.: Agente Opex e Servidor). */
    actions?: ReactNode
}

const TRANSITION = { duration: 0.22, ease: "easeOut" } as const

/**
 * Cabeçalho do celular (OPE-168): logo (link para a home), botão "Abrir menu" e atalhos à direita,
 * com o divisor embaixo. Fica por cima da área que rola, com altura fixa: ao rolar, logo, fundo e
 * divisor somem com animação e o hamburger desliza para o lugar da logo; os botões continuam
 * flutuando sobre o conteúdo. A camada não captura toques fora dos botões.
 */
export function MobileAppHeader({ brand, compact, menuButtonRef, menuOpen, drawerId, onOpenMenu, actions }: MobileAppHeaderProps) {
    const reduceMotion = useReducedMotion() ?? false
    const transition = reduceMotion ? { duration: 0 } : TRANSITION

    return (
        <header aria-label="Cabeçalho" data-app-header="" data-testid="mobile-app-header" data-compact={compact || undefined} className="pointer-events-none absolute inset-x-0 top-0 z-30 h-16">
            <motion.div aria-hidden data-testid="mobile-app-header-background" className="absolute inset-0 bg-background" initial={false} animate={{ opacity: compact ? 0 : 1 }} transition={transition} />
            <div className="relative flex h-full items-center gap-2 px-3">
                <div className="relative flex h-11 items-center" style={{ width: HEADER_LOGO_SLOT + 44 }}>
                    <AnimatePresence initial={false}>
                        {!compact && (
                            <motion.div
                                key="logo"
                                className="pointer-events-auto absolute left-0 top-1/2 -translate-y-1/2"
                                initial={reduceMotion ? false : { opacity: 0, scale: 0.8, x: -8 }}
                                animate={{ opacity: 1, scale: 1, x: 0 }}
                                exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.8, x: -8 }}
                                transition={transition}
                            >
                                <Link href={brand.homeHref} aria-label={brand.name} title={brand.name} className="flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                    <BrandMark />
                                </Link>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <motion.div className="pointer-events-auto absolute left-0" initial={false} animate={{ x: compact ? 0 : HEADER_LOGO_SLOT }} transition={transition} data-testid="mobile-app-header-menu-slot">
                        <HeaderIconButton ref={menuButtonRef} floating={compact} onClick={onOpenMenu} aria-label="Abrir menu" aria-expanded={menuOpen} aria-controls={drawerId}>
                            <Menu className="h-5 w-5" aria-hidden />
                        </HeaderIconButton>
                    </motion.div>
                </div>
                <MobileHeaderFloatingProvider value={compact}>
                    <div className="pointer-events-auto ml-auto flex items-center gap-2 empty:hidden" data-testid="mobile-app-header-actions">
                        {actions}
                    </div>
                </MobileHeaderFloatingProvider>
            </div>
            <AnimatePresence initial={false}>
                {!compact && (
                    <motion.div
                        key="divider"
                        aria-hidden
                        data-testid="mobile-app-header-divider"
                        className="absolute inset-x-0 bottom-0 h-px origin-left bg-border"
                        initial={reduceMotion ? false : { opacity: 0, scaleX: 0.6 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                        exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scaleX: 0.6 }}
                        transition={transition}
                    />
                )}
            </AnimatePresence>
        </header>
    )
}
