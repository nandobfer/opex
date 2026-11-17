"use client"

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AppSidebar, type AppSidebarItemPanels, type SidebarBrand } from "./AppSidebar"
import { useSidebarState } from "../hooks/useSidebarState"
import { useDrawerFocus } from "../hooks/useDrawerFocus"
import { useAppScrollCompact } from "../hooks/useAppScrollCompact"
import { MOBILE_HEADER_OFFSET_CLASS } from "../mobile-header"
import { MobileAppHeader } from "./header/MobileAppHeader"
import { isActiveHref, pageTransitionKey } from "../navigation"
import type { NavBadges, NavSectionDef } from "../types"
import { RealtimeStatusBanner } from "@/lib/pusher/RealtimeStatusBanner"
import { cn } from "@/lib/utils"
import { APP_SCROLL_CONTAINER_ID } from "@/hooks/usePageVirtualizer"
import { CONTENT_PADDING_X, CONTENT_PADDING_X_EVEN } from "../content-padding"

interface AppShellProps {
    brand: SidebarBrand
    sections: readonly NavSectionDef[]
    /** Nome do menu para leitor de tela. */
    navLabel: string
    badges?: NavBadges
    /**
     * Rotas em tela cheia: menu recolhido ao entrar e conteúdo sem padding nem rolagem da casca
     * (a própria tela rola por painel).
     */
    immersiveHrefs?: readonly string[]
    /**
     * Telas com sub-rotas (ex.: `/desenvolvimento/[tarefa]`): navegar dentro delas não
     * anima nem remonta a página inteira; a própria tela anima o trecho que mudou.
     */
    persistentHrefs?: readonly string[]
    /**
     * Telas em que o espaçamento horizontal do conteúdo é igual ao vertical também no desktop
     * (`CONTENT_PADDING_X_EVEN`), em vez do padrão `CONTENT_PADDING_X`.
     */
    evenPaddingHrefs?: readonly string[]
    ownerName: string
    version?: string
    /** Itens extras do menu acima do rodapé (ver `AppSidebar`). */
    sidebarFooterItems?: (collapsed: boolean) => ReactNode
    /** Itens com painel de hover (ver `AppSidebar.itemPanels`). */
    sidebarItemPanels?: AppSidebarItemPanels
    /**
     * Atalhos à direita do cabeçalho do celular (ex.: Agente Opex e Servidor). Com eles, no celular o
     * rodapé da gaveta não repete esses itens (`sidebarFooterItems` vale só no desktop): uma instância
     * só, sem atalhos de teclado e escutas globais duplicados.
     */
    mobileHeaderActions?: ReactNode
    children: ReactNode
}

/**
 * Casca das telas: sidebar + conteúdo (no desktop sem cabeçalho; no celular, `MobileAppHeader` com
 * logo, botão de menu e atalhos, que recolhe ao rolar) com
 * transição de página (Framer Motion, respeitando movimento reduzido). Segue o Shell do DS Sipal:
 * "Pular para o conteúdo" como primeiro foco, gaveta abaixo de 1024px que fecha com Esc/fundo/link
 * (e a cada troca de rota),
 * devolve o foco ao botão de menu e deixa o resto da tela inerte enquanto aberta.
 */
export function AppShell({ brand, sections, navLabel, badges, immersiveHrefs = [], persistentHrefs = [], evenPaddingHrefs = [], ownerName, version, sidebarFooterItems, sidebarItemPanels, mobileHeaderActions, children }: AppShellProps) {
    const pathname = usePathname()
    const reduceMotion = useReducedMotion()
    const immersive = immersiveHrefs.some((href) => isActiveHref(pathname, href))
    const evenPadding = evenPaddingHrefs.some((href) => isActiveHref(pathname, href))
    const sidebar = useSidebarState()
    const drawerId = useId()
    const drawerRef = useRef<HTMLDivElement>(null)
    const menuButtonRef = useRef<HTMLButtonElement>(null)
    const drawerOpen = !sidebar.isDesktop && sidebar.mobileOpen
    const headerCompact = useAppScrollCompact(!sidebar.isDesktop)
    // No celular, atalhos que estão no cabeçalho não se repetem na gaveta.
    const footerItems = !sidebar.isDesktop && mobileHeaderActions ? undefined : sidebarFooterItems

    const { closeMobile } = sidebar
    const closeDrawer = useCallback(() => {
        closeMobile()
        // O botão fica na área inerte enquanto a gaveta está aberta: o foco volta no quadro seguinte.
        requestAnimationFrame(() => menuButtonRef.current?.focus())
    }, [closeMobile])
    useDrawerFocus(drawerOpen, closeDrawer, drawerRef)
    // Links que não são itens do menu (ex.: atalho de configuração no painel "Servidor e quota")
    // não recebem `onNavigate`: a gaveta fecha pela troca de rota.
    useEffect(() => {
        closeMobile()
    }, [pathname, closeMobile])

    const sidebarNode = (
        <AppSidebar
            brand={brand}
            sections={sections}
            navLabel={navLabel}
            collapsed={sidebar.collapsed}
            onNavigate={sidebar.isDesktop ? undefined : closeMobile}
            onClose={sidebar.isDesktop ? undefined : closeDrawer}
            badges={badges}
            ownerName={ownerName}
            version={version}
            footerItems={footerItems}
            itemPanels={sidebarItemPanels}
        />
    )

    return (
        <div className="flex h-dvh overflow-hidden bg-background">
            <a
                href={`#${APP_SCROLL_CONTAINER_ID}`}
                className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
            >
                Pular para o conteúdo
            </a>

            {sidebar.isDesktop && sidebarNode}

            <AnimatePresence>
                {drawerOpen && (
                    <>
                        <motion.div
                            aria-hidden
                            data-testid="sidebar-drawer-backdrop"
                            onClick={closeDrawer}
                            className="fixed inset-0 z-40 bg-black/40"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        />
                        <motion.div
                            ref={drawerRef}
                            id={drawerId}
                            role="dialog"
                            aria-modal="true"
                            aria-label={navLabel}
                            className="fixed inset-y-0 left-0 z-50"
                            initial={{ x: reduceMotion ? 0 : -260 }}
                            animate={{ x: 0 }}
                            exit={{ x: reduceMotion ? 0 : -260 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                        >
                            {sidebarNode}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <div inert={drawerOpen} className="flex min-w-0 flex-1 flex-col">
                <RealtimeStatusBanner />

                {/* `relative`: o cabeçalho do celular fica por cima da área que rola, abaixo do aviso de conexão. */}
                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                    {!sidebar.isDesktop && (
                        <MobileAppHeader
                            brand={brand}
                            compact={headerCompact}
                            menuButtonRef={menuButtonRef}
                            menuOpen={drawerOpen}
                            drawerId={drawerId}
                            onOpenMenu={sidebar.openMobile}
                            actions={mobileHeaderActions}
                        />
                    )}

                    <AnimatePresence mode="wait" initial={false}>
                        <motion.main
                            key={pageTransitionKey(pathname, persistentHrefs)}
                            id={APP_SCROLL_CONTAINER_ID}
                            tabIndex={-1}
                            data-dashboard-content=""
                            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className={cn(
                                immersive
                                    ? "relative min-h-0 min-w-0 flex-1 overflow-hidden outline-none md:p-3"
                                    : // `relative`: elementos absolutos do conteúdo ficam presos à área que rola, nunca à página.
                                      cn("relative min-h-0 min-w-0 flex-1 overflow-y-auto outline-none overflow-x-hidden py-6", evenPadding ? CONTENT_PADDING_X_EVEN : CONTENT_PADDING_X),
                                // Espaço do cabeçalho do celular (altura fixa nos dois estados: sem pulo ao rolar).
                                !sidebar.isDesktop && MOBILE_HEADER_OFFSET_CLASS,
                            )}
                        >
                            {children}
                        </motion.main>
                    </AnimatePresence>
                </div>
            </div>
        </div>
    )
}
