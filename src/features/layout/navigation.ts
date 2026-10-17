import { Banknote, Clock, Container, LayoutDashboard, ListTodo, Plug, Workflow } from "lucide-react"
import type { NavBadgeKey, NavItemDef, NavSectionDef } from "./types"

/** Navegação do app, em seções. */
export const APP_NAV: readonly NavSectionDef[] = [
    {
        id: "inicio",
        items: [
            { href: "/dashboard", label: "Dashboards", title: "Dashboards", icon: LayoutDashboard },
            { href: "/tarefas", label: "Tarefas", title: "Tarefas", icon: ListTodo },
            { href: "/tarefas/horas", label: "Horas agênticas", title: "Horas agênticas", icon: Clock },
            { href: "/financeiro", label: "Financeiro", title: "Financeiro", icon: Banknote },
            { href: "/desenvolvimento", label: "Central de desenvolvimento", title: "Central de desenvolvimento", icon: Workflow },
            { href: "/ambientes", label: "Ambientes", title: "Ambientes", icon: Container },
        ],
    },
    {
        id: "sistema",
        label: "Sistema",
        items: [{ href: "/integracoes", label: "Integrações", title: "Integrações", icon: Plug }],
    },
]

export const HOME_HREF = "/dashboard"

/** Telas cujas sub-rotas não trocam a página inteira (Central de desenvolvimento: central e tarefa na URL). */
export const PERSISTENT_PAGE_HREFS: readonly string[] = ["/desenvolvimento"]

export function flattenNav(sections: readonly NavSectionDef[]): readonly NavItemDef[] {
    return sections.flatMap((section) => section.items)
}

export const APP_NAV_ITEMS: readonly NavItemDef[] = flattenNav(APP_NAV)

const badgeNumber = new Intl.NumberFormat("pt-BR")

/** Texto visível do contador: número em pt-BR, acima de `max` mostra "99+". */
export function formatBadge(count: number, max = 99): string {
    return count > max ? `${badgeNumber.format(max)}+` : badgeNumber.format(count)
}

/** Texto do contador para leitor de tela ("3 tarefas", não só "3"). */
export function badgeLabel(key: NavBadgeKey, count: number): string {
    const n = badgeNumber.format(count)
    switch (key) {
        case "tasks":
            return count === 1 ? `${n} tarefa` : `${n} tarefas`
    }
}

export function isActiveHref(pathname: string, href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Chave da transição de página da casca: caminhos sob um dos `persistentHrefs` contam como a mesma
 * tela (o prefixo), então navegar entre sub-rotas dela não anima nem remonta a página inteira — só o
 * trecho que mudou anima por conta própria. Fora deles, cada caminho é uma tela.
 */
export function pageTransitionKey(pathname: string, persistentHrefs: readonly string[]): string {
    return persistentHrefs.find((href) => isActiveHref(pathname, href)) ?? pathname
}

/**
 * Item ativo do menu: o de `href` mais específico que casa com o caminho (em `/tarefas/horas`
 * fica ativo "Horas agênticas", não "Tarefas"; em `/tarefas/123`, "Tarefas").
 */
export function activeNavHref(pathname: string, items: readonly NavItemDef[]): string | null {
    let best: string | null = null
    for (const item of items) if (isActiveHref(pathname, item.href) && (!best || item.href.length > best.length)) best = item.href
    return best
}
