/** @vitest-environment happy-dom */

import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ListTodo, Plug, Settings } from "lucide-react"
import { framerMotionMock } from "../../helpers/framer-motion"

const mocks = vi.hoisted(() => ({
    pathname: "/tarefas",
}))

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }))
vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}))

import { AppSidebar } from "@/features/layout/components/AppSidebar"
import { APP_NAV } from "@/features/layout/navigation"
import type { NavBadges, NavSectionDef } from "@/features/layout/types"

const STORAGE_KEY = "opex-sidebar-closed-sections"

/** Seções de teste com contador e duas seções com título. */
const SECTIONS: readonly NavSectionDef[] = [
    { id: "trabalho", label: "Trabalho", items: [{ href: "/tarefas", label: "Tarefas", title: "Tarefas", icon: ListTodo, badge: "tasks" }] },
    {
        id: "sistema",
        label: "Sistema",
        items: [
            { href: "/integracoes", label: "Integrações", title: "Integrações", icon: Plug },
            { href: "/ajustes", label: "Ajustes", title: "Ajustes", icon: Settings },
        ],
    },
]

function renderSidebar(options: { collapsed?: boolean; badges?: NavBadges; sections?: readonly NavSectionDef[]; footerItems?: (collapsed: boolean) => React.ReactNode } = {}) {
    return render(
        <AppSidebar
            brand={{ name: "Meu App", subtitle: "Pessoal", homeHref: "/tarefas" }}
            sections={options.sections ?? SECTIONS}
            navLabel="Menu principal"
            collapsed={options.collapsed ?? false}
            badges={options.badges}
            ownerName="Ana Souza"
            version="1.2.3"
            footerItems={options.footerItems}
        />,
    )
}

beforeEach(() => {
    mocks.pathname = "/tarefas"
    window.localStorage.clear()
})
afterEach(cleanup)

describe("AppSidebar — padrão SideNavigation do DS Sipal", () => {
    it("mostra as seções do app com título e item ativo marcado", () => {
        renderSidebar({ sections: APP_NAV })
        expect(screen.getByRole("navigation", { name: "Menu principal" })).toBeTruthy()
        // Seção "inicio" não tem título: os itens ficam soltos.
        expect(screen.queryByRole("button", { name: /inicio/i })).toBeNull()
        expect(screen.getByRole("button", { name: "Sistema" })).toBeTruthy()
        expect(screen.getByRole("link", { name: /Tarefas/ }).getAttribute("aria-current")).toBe("page")
        expect(screen.getByRole("link", { name: /Integrações/ }).hasAttribute("aria-current")).toBe(false)
    })

    it("o topo mostra a logo (símbolo do favicon) no lugar da letra inicial", () => {
        const { container } = renderSidebar({ collapsed: true })
        const logo = container.querySelector("img")
        expect(logo?.getAttribute("src")).toBe("/opex-mark.png")
        expect(logo?.getAttribute("alt")).toBe("")
    })

    it("recolhido (desktop): versão no rodapé, avatar abre o popover com Sair e não há botões de recolher/expandir", async () => {
        renderSidebar({ collapsed: true })
        expect(document.body.textContent ?? "").toContain("v1.2.3")
        // Sem botão de logout solto nem botões de toggle.
        expect(screen.queryByRole("button", { name: "Sair" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Expandir menu" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Recolher menu" })).toBeNull()

        fireEvent.click(screen.getByRole("button", { name: "Ana Souza" }))
        expect(await screen.findByRole("button", { name: "Sair" })).toBeTruthy()
    })

    it("expandido (mobile): mantém dono, versão e Sair inline, sem botões de toggle", () => {
        renderSidebar({ collapsed: false })
        const text = document.body.textContent ?? ""
        expect(text).toContain("Ana Souza")
        expect(text).toContain("AS")
        expect(text).toContain("v1.2.3")
        expect(screen.getByRole("button", { name: "Sair" })).toBeTruthy()
        expect(screen.queryByRole("button", { name: "Expandir menu" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Recolher menu" })).toBeNull()
    })

    it("contador mostra 99+ e anuncia a quantidade para leitor de tela", () => {
        renderSidebar({ badges: { tasks: 150 } })
        const tarefas = screen.getByRole("link", { name: /Tarefas/ })
        expect(tarefas.textContent).toContain("99+")
        expect(tarefas.textContent).toContain("150 tarefas")
    })

    it("recolhido: o item mantém nome acessível e o ponto de aviso também é anunciado", () => {
        renderSidebar({ collapsed: true, badges: { tasks: 2 } })
        const tarefas = screen.getByRole("link", { name: "Tarefas" })
        expect(tarefas.querySelector("[data-testid='sidebar-badge-dot']")?.textContent).toBe("2 tarefas")
        // Títulos viram divisores: nenhum botão de seção.
        expect(screen.queryByRole("button", { name: "Sistema" })).toBeNull()
        expect(screen.getByRole("group", { name: "Sistema" })).toBeTruthy()
    })

    it("seção abre e fecha com aria-expanded e lembra a escolha", () => {
        renderSidebar()
        const sistema = screen.getByRole("button", { name: "Sistema" })
        expect(sistema.getAttribute("aria-expanded")).toBe("true")
        fireEvent.click(sistema)
        expect(sistema.getAttribute("aria-expanded")).toBe("false")
        expect(screen.queryByRole("link", { name: /Integrações/ })).toBeNull()
        expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]")).toEqual(["sistema"])
    })

    it("a seção da página atual não fica escondida mesmo se estava fechada", async () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["trabalho", "sistema"]))
        renderSidebar()
        expect(await screen.findByRole("link", { name: /Tarefas/ })).toBeTruthy()
        // O estado salvo é lido depois da montagem: espera aplicar em vez de contar microtarefas.
        await waitFor(() => expect(screen.getByRole("button", { name: "Sistema" }).getAttribute("aria-expanded")).toBe("false"))
        expect(screen.getByRole("button", { name: "Trabalho" }).getAttribute("aria-expanded")).toBe("true")
    })

    it("itens extras do rodapé (Agente Opex no menu do dono) recebem o estado recolhido; sem eles, nada aparece", () => {
        const footerItems = vi.fn((collapsed: boolean) => <li>{collapsed ? "Agente (recolhido)" : "Agente Opex"}</li>)
        renderSidebar({ collapsed: true, footerItems })
        expect(screen.getByText("Agente (recolhido)")).toBeTruthy()
        expect(footerItems).toHaveBeenCalledWith(true)
        cleanup()
        renderSidebar()
        expect(screen.queryByText(/Agente/)).toBeNull()
    })
})
