import { describe, expect, it } from "vitest"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { Bot, CodeXml, GraduationCap, Landmark, Palette, Plug, Settings, Swords } from "lucide-react"
import { activeNavHref, APP_NAV, APP_NAV_ITEMS, HOME_HREF, badgeLabel, flattenNav, formatBadge, isActiveHref, navGroupActive, pageTransitionKey, PERSISTENT_PAGE_HREFS } from "@/features/layout/navigation"
import { isNavGroup } from "@/features/layout/types"
import { AGENT_CATALOG } from "@/features/agent-metrics/catalog"
import { AI_EDITOR_TABS } from "@/features/ai/tabs"

describe("navegação em seções (padrão SideNavigation do DS Sipal)", () => {
    it("toda seção tem id único e no máximo 7 itens", () => {
        const ids = APP_NAV.map((section) => section.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const section of APP_NAV) expect(section.items.length).toBeLessThanOrEqual(7)
    })

    it("itens soltos (Tarefas, Central de desenvolvimento, Engramind), grupos Agentes e Contábil, Integrações e Configurações, nesta ordem", () => {
        expect(APP_NAV.map((section) => [section.id, section.label])).toEqual([["inicio", undefined]])
        const entries = APP_NAV[0]!.items.map((entry) => (isNavGroup(entry) ? [entry.label, entry.items.map((item) => [item.label, item.href])] : [entry.label, entry.href]))
        expect(entries).toEqual([
            ["Tarefas", "/tarefas"],
            ["Central de desenvolvimento", "/desenvolvimento"],
            ["Engramind", "/engramind"],
            [
                "Agentes",
                [
                    ["Opex", "/agente-opex"],
                    ["Maddox", "/agente-maddox"],
                    ["Orçamentista", "/agente-orcamentista"],
                    ["Catalogador", "/agente-catalogador"],
                    ["Refinador", "/agente-refinador"],
                    ["Desenvolvedor", "/agente-desenvolvedor"],
                    ["Arquiteto", "/agente-arquiteto"],
                    ["Adversário", "/agente-adversario"],
                    ["Revisor", "/agente-revisor"],
                    ["Mentor", "/agente-mentor"],
                ],
            ],
            [
                "Contábil",
                [
                    ["Horas agênticas", "/tarefas/horas"],
                    ["Financeiro", "/financeiro"],
                ],
            ],
            ["Integrações", "/integracoes"],
            ["Configurações", [["Ambientes", "/ambientes"], ["Aparência", "/configuracoes/aparencia"]]],
        ])
    })

    it("Integrações é item próprio (não está em Configurações) e abre o submenu das integrações no hover (OPE-120)", () => {
        const integracoes = APP_NAV[0]!.items.find((entry) => !isNavGroup(entry) && entry.href === "/integracoes")
        expect(integracoes && !isNavGroup(integracoes) ? [integracoes.label, integracoes.icon, integracoes.panel] : null).toEqual(["Integrações", Plug, "integrations"])
        const configuracoes = APP_NAV[0]!.items.filter(isNavGroup).find((group) => group.id === "configuracoes")
        expect(configuracoes?.items.map((item) => item.href)).toEqual(["/ambientes", "/configuracoes/aparencia"])
        expect(activeNavHref("/integracoes/github", APP_NAV_ITEMS)).toBe("/integracoes")
    })

    it("APP_NAV_ITEMS (flattenNav) inclui os itens de dentro dos grupos, na ordem do menu", () => {
        expect(APP_NAV_ITEMS.map((item) => item.href)).toEqual([
            "/tarefas",
            "/desenvolvimento",
            "/engramind",
            "/agente-opex",
            "/agente-maddox",
            "/agente-orcamentista",
            "/agente-catalogador",
            "/agente-refinador",
            "/agente-desenvolvedor",
            "/agente-arquiteto",
            "/agente-adversario",
            "/agente-revisor",
            "/agente-mentor",
            "/tarefas/horas",
            "/financeiro",
            "/integracoes",
            "/ambientes",
            "/configuracoes/aparencia",
        ])
        expect(flattenNav(APP_NAV)).toEqual(APP_NAV_ITEMS)
    })

    it("Configurações › Aparência (OPE-136) usa o ícone Palette e marca o grupo como ativo", () => {
        const configuracoes = APP_NAV[0]!.items.filter(isNavGroup).find((group) => group.id === "configuracoes")!
        expect(APP_NAV_ITEMS.find((item) => item.href === "/configuracoes/aparencia")?.icon).toBe(Palette)
        expect(navGroupActive(configuracoes, activeNavHref("/configuracoes/aparencia", APP_NAV_ITEMS))).toBe(true)
    })

    it("grupos usam os ícones Bot, Landmark e Settings", () => {
        const groups = APP_NAV[0]!.items.filter(isNavGroup)
        expect(groups.map((group) => [group.id, group.icon])).toEqual([
            ["agentes", Bot],
            ["contabil", Landmark],
            ["configuracoes", Settings],
        ])
    })

    it("Central de desenvolvimento usa o ícone </> (CodeXml); os agentes usam os ícones das abas de configuração", () => {
        const icon = (href: string) => APP_NAV_ITEMS.find((item) => item.href === href)?.icon
        expect(icon("/desenvolvimento")).toBe(CodeXml)
        expect(icon("/agente-adversario")).toBe(Swords)
        expect(icon("/agente-mentor")).toBe(GraduationCap)
        expect(activeNavHref("/agente-adversario", APP_NAV_ITEMS)).toBe("/agente-adversario")
        expect(activeNavHref("/agente-mentor", APP_NAV_ITEMS)).toBe("/agente-mentor")
    })

    it("item ativo é o mais específico, inclusive dentro dos grupos", () => {
        expect(activeNavHref("/tarefas/horas", APP_NAV_ITEMS)).toBe("/tarefas/horas")
        expect(activeNavHref("/tarefas/abc123", APP_NAV_ITEMS)).toBe("/tarefas")
        expect(activeNavHref("/tarefas", APP_NAV_ITEMS)).toBe("/tarefas")
        expect(activeNavHref("/financeiro", APP_NAV_ITEMS)).toBe("/financeiro")
        expect(activeNavHref("/integracoes/crons", APP_NAV_ITEMS)).toBe("/integracoes")
        expect(activeNavHref("/outra", APP_NAV_ITEMS)).toBeNull()
    })

    it("navGroupActive: o grupo fica ativo quando contém o item ativo", () => {
        const [agentes, contabil, configuracoes] = APP_NAV[0]!.items.filter(isNavGroup)
        expect(navGroupActive(contabil!, activeNavHref("/tarefas/horas", APP_NAV_ITEMS))).toBe(true)
        expect(navGroupActive(agentes!, activeNavHref("/tarefas/horas", APP_NAV_ITEMS))).toBe(false)
        expect(navGroupActive(configuracoes!, activeNavHref("/ambientes/x", APP_NAV_ITEMS))).toBe(true)
        expect(navGroupActive(configuracoes!, null)).toBe(false)
    })

    it("Dashboards saiu do menu, mas segue como página inicial (a logo leva a ela) e a rota existe", () => {
        expect(HOME_HREF).toBe("/dashboard")
        expect(APP_NAV_ITEMS.some((item) => item.href === "/dashboard")).toBe(false)
        expect(activeNavHref("/dashboard", APP_NAV_ITEMS)).toBeNull()
        expect(existsSync(join(process.cwd(), "src/app/(app)/dashboard/page.tsx"))).toBe(true)
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

describe("categoria Agentes (OPE-122)", () => {
    const agentes = APP_NAV[0]!.items.filter(isNavGroup).find((group) => group.id === "agentes")!

    it("lista os 10 agentes do catálogo, na ordem do fluxo, sem a palavra Agente no rótulo", () => {
        expect(agentes.items.map((item) => item.href)).toEqual(AGENT_CATALOG.map((agent) => agent.href))
        expect(agentes.items).toHaveLength(10)
        for (const item of agentes.items) expect(item.label).not.toMatch(/agente/i)
        for (const item of agentes.items) expect(item.title).toMatch(/^Agente /)
    })

    it("nome e ícone de cada item são os mesmos da aba de configuração em Integrações › Inteligência Artificial", () => {
        const tabs = AI_EDITOR_TABS.slice(1)
        expect(tabs.map((tab) => tab.id)).toEqual(AGENT_CATALOG.map((agent) => agent.settingsTab))
        agentes.items.forEach((item, index) => {
            expect(item.label).toBe(tabs[index]!.label)
            expect(item.icon).toBe(tabs[index]!.icon)
        })
    })

    it("todo agente tem página em src/app/(app)", () => {
        for (const agent of AGENT_CATALOG) expect(existsSync(join(process.cwd(), `src/app/(app)${agent.href}/page.tsx`)), agent.href).toBe(true)
    })
})
