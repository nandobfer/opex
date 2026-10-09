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
