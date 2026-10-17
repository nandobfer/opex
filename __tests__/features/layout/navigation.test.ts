import { describe, expect, it } from "vitest"
import { activeNavHref, APP_NAV, APP_NAV_ITEMS, HOME_HREF, badgeLabel, flattenNav, formatBadge, isActiveHref, pageTransitionKey, PERSISTENT_PAGE_HREFS } from "@/features/layout/navigation"

describe("navegação em seções (padrão SideNavigation do DS Sipal)", () => {
    it("toda seção tem id único e no máximo 7 itens", () => {
        const ids = APP_NAV.map((section) => section.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const section of APP_NAV) expect(section.items.length).toBeLessThanOrEqual(7)
    })

    it("seções Início (Dashboards, Tarefas, Horas agênticas, Financeiro, Central de desenvolvimento) e Sistema (Integrações)", () => {
        expect(APP_NAV.map((section) => [section.id, section.label])).toEqual([
            ["inicio", undefined],
            ["sistema", "Sistema"],
        ])
        expect(APP_NAV_ITEMS.map((item) => [item.label, item.href])).toEqual([
            ["Dashboards", "/dashboard"],
            ["Tarefas", "/tarefas"],
            ["Horas agênticas", "/tarefas/horas"],
            ["Financeiro", "/financeiro"],
            ["Central de desenvolvimento", "/desenvolvimento"],
            ["Ambientes", "/ambientes"],
            ["Integrações", "/integracoes"],
        ])
        expect(flattenNav(APP_NAV)).toEqual(APP_NAV_ITEMS)
    })

    it("item ativo é o mais específico: Horas agênticas em /tarefas/horas, Tarefas em /tarefas/123", () => {
        expect(activeNavHref("/dashboard", APP_NAV_ITEMS)).toBe("/dashboard")
        expect(activeNavHref("/tarefas/horas", APP_NAV_ITEMS)).toBe("/tarefas/horas")
        expect(activeNavHref("/tarefas/abc123", APP_NAV_ITEMS)).toBe("/tarefas")
        expect(activeNavHref("/tarefas", APP_NAV_ITEMS)).toBe("/tarefas")
        expect(activeNavHref("/financeiro", APP_NAV_ITEMS)).toBe("/financeiro")
        expect(activeNavHref("/outra", APP_NAV_ITEMS)).toBeNull()
    })

    it("a página inicial é Dashboards e está no menu", () => {
        expect(HOME_HREF).toBe("/dashboard")
        expect(APP_NAV_ITEMS.some((item) => item.href === HOME_HREF)).toBe(true)
    })

    it("item ativo pela rota exata ou por subrota", () => {
        expect(isActiveHref("/integracoes", "/integracoes")).toBe(true)
        expect(isActiveHref("/integracoes/crons", "/integracoes")).toBe(true)
        expect(isActiveHref("/integracoes-x", "/integracoes")).toBe(false)
        expect(isActiveHref("/tarefas", "/integracoes")).toBe(false)
    })
})

describe("chave da transição de página", () => {
    it("tarefas e centrais da Central de desenvolvimento são a mesma tela (não anima a página inteira)", () => {
        const tarefaA = pageTransitionKey("/desenvolvimento/c1/t1", PERSISTENT_PAGE_HREFS)
        expect(pageTransitionKey("/desenvolvimento/c1/t2", PERSISTENT_PAGE_HREFS)).toBe(tarefaA)
        expect(pageTransitionKey("/desenvolvimento/c2/t9", PERSISTENT_PAGE_HREFS)).toBe(tarefaA)
        expect(pageTransitionKey("/desenvolvimento", PERSISTENT_PAGE_HREFS)).toBe(tarefaA)
    })

    it("fora das telas persistentes, cada caminho é uma tela", () => {
        expect(pageTransitionKey("/tarefas", PERSISTENT_PAGE_HREFS)).toBe("/tarefas")
        expect(pageTransitionKey("/tarefas/horas", PERSISTENT_PAGE_HREFS)).toBe("/tarefas/horas")
        expect(pageTransitionKey("/desenvolvimento-x/1", PERSISTENT_PAGE_HREFS)).toBe("/desenvolvimento-x/1")
    })
})

describe("contadores do menu", () => {
    it("formata em pt-BR com limite 99+", () => {
        expect(formatBadge(7)).toBe("7")
        expect(formatBadge(99)).toBe("99")
        expect(formatBadge(100)).toBe("99+")
    })

    it("texto para leitor de tela inclui a quantidade e concorda no singular/plural", () => {
        expect(badgeLabel("tasks", 1)).toBe("1 tarefa")
        expect(badgeLabel("tasks", 3)).toBe("3 tarefas")
        expect(badgeLabel("tasks", 1200)).toBe("1.200 tarefas")
    })
})
