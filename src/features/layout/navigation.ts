import { Banknote, Bot, Clock, CodeXml, GitPullRequest, GraduationCap, Landmark, ListTodo, Network, Plug, Server, Settings, Swords } from "lucide-react"
import { ADVERSARIAL_PAGE_HREF } from "@/features/adversarial-agent/constants"
import { MENTOR_PAGE_HREF } from "@/features/adversarial-agent/mentor/constants"
import { PR_REVIEWS_HREF } from "@/features/pr-review/constants"
import { isNavGroup, type NavBadgeKey, type NavGroupDef, type NavItemDef, type NavSectionDef } from "./types"

/**
 * Navegação do app: itens simples (Tarefas, Central de desenvolvimento, Engramind) e grupos que abrem
 * um painel à direita (Agentes, Contábil e Configurações). Dashboards não tem item: a logo leva a ela.
 */
export const APP_NAV: readonly NavSectionDef[] = [
    {
        id: "inicio",
        items: [
            { href: "/tarefas", label: "Tarefas", title: "Tarefas", icon: ListTodo },
            { href: "/desenvolvimento", label: "Central de desenvolvimento", title: "Central de desenvolvimento", icon: CodeXml },
            { href: "/engramind", label: "Engramind", title: "Engramind", icon: Network },
            {
                kind: "group",
                id: "agentes",
                label: "Agentes",
                icon: Bot,
                items: [
                    { href: PR_REVIEWS_HREF, label: "Agente Revisor", title: "Agente Revisor", icon: GitPullRequest },
                    { href: ADVERSARIAL_PAGE_HREF, label: "Agente Adversário", title: "Agente Adversário", icon: Swords },
                    { href: MENTOR_PAGE_HREF, label: "Agente Mentor", title: "Agente Mentor", icon: GraduationCap },
                ],
            },
            {
                kind: "group",
                id: "contabil",
                label: "Contábil",
                icon: Landmark,
                items: [
                    { href: "/tarefas/horas", label: "Horas agênticas", title: "Horas agênticas", icon: Clock },
                    { href: "/financeiro", label: "Financeiro", title: "Financeiro", icon: Banknote },
                ],
            },
            {
                kind: "group",
                id: "configuracoes",
                label: "Configurações",
                icon: Settings,
                items: [
                    { href: "/integracoes", label: "Integrações", title: "Integrações", icon: Plug },
                    { href: "/ambientes", label: "Ambientes", title: "Ambientes", icon: Server },
                ],
            },
        ],
    },
]

export const HOME_HREF = "/dashboard"

/** Telas cujas sub-rotas não trocam a página inteira (Central de desenvolvimento: central e tarefa na URL). */
export const PERSISTENT_PAGE_HREFS: readonly string[] = ["/desenvolvimento"]

/** Telas com espaçamento horizontal igual ao vertical também no desktop (Central de desenvolvimento, OPE-112). */
export const EVEN_PADDING_PAGE_HREFS: readonly string[] = ["/desenvolvimento"]

/** Todos os itens navegáveis, inclusive os de dentro dos grupos (na ordem do menu). */
export function flattenNav(sections: readonly NavSectionDef[]): readonly NavItemDef[] {
    return sections.flatMap((section) => section.items.flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry])))
}

/** O grupo contém o item ativo (o gatilho do grupo fica marcado como ativo). */
export function navGroupActive(group: NavGroupDef, activeHref: string | null): boolean {
    return activeHref !== null && group.items.some((item) => item.href === activeHref)
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
