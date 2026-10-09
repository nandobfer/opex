import type { LucideIcon } from "lucide-react"

/** Contadores que um item do menu pode exibir (nenhum por enquanto). */
export type NavBadgeKey = "tasks"

/** Item de navegação. */
export interface NavItemDef {
    label: string
    /** Título exibido no cabeçalho da página. */
    title: string
    href: string
    icon: LucideIcon
    badge?: NavBadgeKey
}

/**
 * Seção do menu (padrão SideNavigation do DS Sipal): título em caixa-alta, até 7 itens, recolhível.
 * Sem `label`, os itens ficam soltos no topo (sem título nem recolhimento).
 */
export interface NavSectionDef {
    /** Identificador estável (chave da preferência aberta/fechada salva no navegador). */
    id: string
    label?: string
    items: readonly NavItemDef[]
}

export type NavBadges = Partial<Record<NavBadgeKey, number>>
