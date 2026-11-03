import type { LucideIcon } from "lucide-react"

/** Contadores que um item do menu pode exibir (nenhum por enquanto). */
export type NavBadgeKey = "tasks"

/**
 * Painéis de hover que um item do menu pode abrir (o conteúdo vem de fora do layout, por
 * `AppSidebar.itemPanels`). `integrations`: submenu das integrações (OPE-120).
 */
export type NavPanelKey = "integrations"

/** Item de navegação. */
export interface NavItemDef {
    label: string
    /** Título exibido no cabeçalho da página. */
    title: string
    href: string
    icon: LucideIcon
    badge?: NavBadgeKey
    /** O item também abre um painel ao passar o mouse (o clique continua navegando para `href`). */
    panel?: NavPanelKey
}

/**
 * Grupo do menu: um único item na barra (ícone + nome) que abre, ao passar o mouse, tocar ou
 * pelo teclado, um painel à direita (fora da barra) com os itens do grupo.
 */
export interface NavGroupDef {
    kind: "group"
    /** Identificador estável do grupo. */
    id: string
    label: string
    icon: LucideIcon
    items: readonly NavItemDef[]
}

/** Entrada do menu: item simples ou grupo. */
export type NavEntryDef = NavItemDef | NavGroupDef

export function isNavGroup(entry: NavEntryDef): entry is NavGroupDef {
    return "kind" in entry && entry.kind === "group"
}

/**
 * Seção do menu (padrão SideNavigation do DS Sipal): título em caixa-alta, até 7 itens, recolhível.
 * Sem `label`, os itens ficam soltos no topo (sem título nem recolhimento).
 */
export interface NavSectionDef {
    /** Identificador estável (chave da preferência aberta/fechada salva no navegador). */
    id: string
    label?: string
    items: readonly NavEntryDef[]
}

/** Props do componente que renderiza um item com painel (`AppSidebar.itemPanels`); renderiza o próprio `<li>`. */
export interface SidebarPanelItemProps {
    item: NavItemDef
    active: boolean
    reduceMotion: boolean
    onNavigate?: () => void
}

export type NavBadges = Partial<Record<NavBadgeKey, number>>
