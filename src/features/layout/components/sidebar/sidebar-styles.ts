/**
 * Foco visível só pelo teclado (padrão do DS Sipal), em anel interno para não ser cortado pela
 * rolagem do menu. Na cor primária, para contrastar com o fundo escuro.
 */
export const SIDEBAR_FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/80"

/** Variantes de entrada dos itens — copiadas do `DashboardSidebar` do Smart Desk. */
export const sidebarItemVariants = {
    hidden: { opacity: 0, x: -8 },
    show: { opacity: 1, x: 0 },
}

/** Link dentro de um painel do menu (grupos e submenus): base, ativo e inativo. */
export const SIDEBAR_PANEL_LINK = "flex items-center gap-2.5 rounded-[4px] px-2.5 py-2 text-sm transition-colors"
export const SIDEBAR_PANEL_LINK_ACTIVE = "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
export const SIDEBAR_PANEL_LINK_IDLE = "text-popover-foreground/80 hover:bg-sidebar-accent/60 hover:text-popover-foreground"
