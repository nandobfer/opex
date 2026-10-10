"use client"

import { useCallback, useId, useRef, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Menu } from "lucide-react"
import { AppSidebar, type SidebarBrand } from "./AppSidebar"
import { useSidebarState } from "../hooks/useSidebarState"
import { useDrawerFocus } from "../hooks/useDrawerFocus"
import { isActiveHref, pageTransitionKey } from "../navigation"
import type { NavBadges, NavSectionDef } from "../types"
import { RealtimeStatusBanner } from "@/lib/pusher/RealtimeStatusBanner"
import { cn } from "@/lib/utils"
import { APP_SCROLL_CONTAINER_ID } from "@/hooks/usePageVirtualizer"
import { CONTENT_PADDING_X } from "../content-padding"

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
    ownerName: string
    version?: string
    children: ReactNode
}

/**
 * Casca das telas: sidebar + conteúdo (sem cabeçalho; no celular, botão flutuante abre o menu) com
 * transição de página (Framer Motion, respeitando movimento reduzido). Segue o Shell do DS Sipal:
 * "Pular para o conteúdo" como primeiro foco, gaveta abaixo de 1024px que fecha com Esc/fundo/link,
 * devolve o foco ao botão de menu e deixa o resto da tela inerte enquanto aberta.
 */
export function AppShell({ brand, sections, navLabel, badges, immersiveHrefs = [], persistentHrefs = [], ownerName, version, children }: AppShellProps) {
    const pathname = usePathname()
    const reduceMotion = useReducedMotion()
    const immersive = immersiveHrefs.some((href) => isActiveHref(pathname, href))
    const sidebar = useSidebarState(immersive)
    const drawerId = useId()
    const drawerRef = useRef<HTMLDivElement>(null)
    const menuButtonRef = useRef<HTMLButtonElement>(null)
    const drawerOpen = !sidebar.isDesktop && sidebar.mobileOpen

    const { closeMobile } = sidebar
    const closeDrawer = useCallback(() => {
        closeMobile()
        // O botão fica na área inerte enquanto a gaveta está aberta: o foco volta no quadro seguinte.
        requestAnimationFrame(() => menuButtonRef.current?.focus())
    }, [closeMobile])
    useDrawerFocus(drawerOpen, closeDrawer, drawerRef)

    const sidebarNode = (
        <AppSidebar
            brand={brand}
            sections={sections}
            navLabel={navLabel}
            collapsed={sidebar.collapsed}
            canCollapse={sidebar.isDesktop}
            onToggleCollapsed={sidebar.toggleCollapsed}
            onNavigate={sidebar.isDesktop ? undefined : closeMobile}
            onClose={sidebar.isDesktop ? undefined : closeDrawer}
            badges={badges}
            ownerName={ownerName}
            version={version}
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
                {!sidebar.isDesktop && (
                    <motion.button
                        ref={menuButtonRef}
                        type="button"
                        onClick={sidebar.openMobile}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileTap={{ scale: 0.92 }}
                        className="fixed left-3 top-3 z-30 rounded-md border border-border bg-card/90 p-2 text-muted-foreground shadow-lg backdrop-blur transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Abrir menu"
                        aria-expanded={drawerOpen}
                        aria-controls={drawerId}
                    >
                        <Menu className="h-5 w-5" />
                    </motion.button>
                )}

                <RealtimeStatusBanner />

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
                                  cn("relative min-h-0 min-w-0 flex-1 overflow-y-auto outline-none overflow-x-hidden py-6", CONTENT_PADDING_X),
                            // Espaço para o botão flutuante do menu no celular.
                            !sidebar.isDesktop && "pt-16",
                        )}
                    >
                        {children}
                    </motion.main>
                </AnimatePresence>
            </div>
        </div>
    )
}
