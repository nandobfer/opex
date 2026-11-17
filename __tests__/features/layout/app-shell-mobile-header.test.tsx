/** @vitest-environment happy-dom */

import React from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"

const nav = vi.hoisted(() => ({ pathname: "/tarefas" }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }))
vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}))
vi.mock("@/lib/pusher/RealtimeStatusBanner", () => ({ RealtimeStatusBanner: () => null }))

import { AppShell } from "@/features/layout/components/AppShell"
import { APP_NAV } from "@/features/layout/navigation"

const footer = () => <li data-testid="footer-shortcut">atalho</li>

function shell(withActions = true) {
    return (
        <AppShell
            brand={{ name: "Opex", homeHref: "/inicio" }}
            sections={APP_NAV}
            navLabel="Menu principal"
            ownerName="Ana"
            sidebarFooterItems={footer}
            mobileHeaderActions={withActions ? <button type="button" aria-label="Agente Opex" /> : undefined}
        >
            <p>conteúdo</p>
            <div data-testid="inner-panel" />
        </AppShell>
    )
}

const flushFrames = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

async function scrollTo(element: HTMLElement, top: number) {
    Object.defineProperty(element, "scrollTop", { configurable: true, value: top })
    fireEvent.scroll(element)
    await flushFrames()
}

const main = () => document.getElementById("main-content")!
const header = () => screen.getByTestId("mobile-app-header")

beforeEach(() => {
    window.innerWidth = 500
    nav.pathname = "/tarefas"
})
afterEach(cleanup)

describe("AppShell — cabeçalho do celular ao rolar (OPE-168)", () => {
    it("um único botão de menu, logo para a home, atalhos à direita e divisor no topo", async () => {
        render(shell())
        await flushFrames()
        expect(screen.getAllByRole("button", { name: "Abrir menu" })).toHaveLength(1)
        expect(screen.getByRole("link", { name: "Opex" }).getAttribute("href")).toBe("/inicio")
        expect(header().contains(screen.getByRole("button", { name: "Agente Opex" }))).toBe(true)
        expect(screen.getByTestId("mobile-app-header-divider")).toBeTruthy()
        expect(header().hasAttribute("data-compact")).toBe(false)
    })

    it("ao rolar o conteúdo recolhe (logo e divisor saem, atalhos ficam) e volta ao topo ao subir", async () => {
        render(shell())
        await flushFrames()
        const padding = main().className
        await scrollTo(main(), 200)
        expect(header().getAttribute("data-compact")).toBe("true")
        expect(screen.queryByRole("link", { name: "Opex" })).toBeNull()
        expect(screen.queryByTestId("mobile-app-header-divider")).toBeNull()
        expect(screen.getByRole("button", { name: "Abrir menu" })).toBeTruthy()
        expect(screen.getByRole("button", { name: "Agente Opex" })).toBeTruthy()
        // O espaço reservado do conteúdo não muda: sem pulo de layout.
        expect(main().className).toBe(padding)
        expect(main().classList.contains("pt-16")).toBe(true)

        await scrollTo(main(), 0)
        expect(header().hasAttribute("data-compact")).toBe(false)
        expect(screen.getByRole("link", { name: "Opex" })).toBeTruthy()
        expect(screen.getByTestId("mobile-app-header-divider")).toBeTruthy()
    })

    it("na troca de rota, o <main> antigo ainda no DOM (saída da transição) com rolagem alta não recolhe a tela nova", async () => {
        const { rerender } = render(shell())
        await flushFrames()
        await scrollTo(main(), 300)
        expect(header().getAttribute("data-compact")).toBe("true")
        // Simula o <main> em saída: mesmo id, rolagem antiga, ainda no DOM depois da troca.
        const exiting = document.createElement("main")
        exiting.id = "main-content"
        Object.defineProperty(exiting, "scrollTop", { configurable: true, value: 300 })
        document.body.prepend(exiting)
        try {
            nav.pathname = "/integracoes"
            rerender(shell())
            await flushFrames()
            await flushFrames()
            expect(header().hasAttribute("data-compact")).toBe(false)
            expect(screen.getByRole("link", { name: "Opex" })).toBeTruthy()
        } finally {
            exiting.remove()
        }
    })

    it("rolagem de um painel interno não recolhe o cabeçalho", async () => {
        render(shell())
        await flushFrames()
        await scrollTo(screen.getByTestId("inner-panel"), 500)
        expect(header().hasAttribute("data-compact")).toBe(false)
    })

    it("ao trocar de tela começa no estado do topo", async () => {
        const { rerender } = render(shell())
        await flushFrames()
        await scrollTo(main(), 300)
        expect(header().getAttribute("data-compact")).toBe("true")
        nav.pathname = "/integracoes"
        rerender(shell())
        expect(header().hasAttribute("data-compact")).toBe(false)
        await scrollTo(main(), 0)
        expect(header().hasAttribute("data-compact")).toBe(false)
    })

    it("com a gaveta aberta o cabeçalho fica inerte; Esc devolve o foco ao botão do cabeçalho", async () => {
        render(shell())
        const menu = screen.getByRole("button", { name: "Abrir menu" })
        fireEvent.click(menu)
        expect(header().closest("[inert]")).not.toBeNull()
        fireEvent.keyDown(document, { key: "Escape" })
        await flushFrames()
        expect(document.activeElement).toBe(menu)
    })

    it("com atalhos no cabeçalho, a gaveta do celular não repete o rodapé", () => {
        render(shell())
        fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }))
        expect(screen.getByRole("dialog", { name: "Menu principal" })).toBeTruthy()
        expect(screen.queryByTestId("footer-shortcut")).toBeNull()
    })

    it("sem atalhos no cabeçalho, a gaveta mantém o rodapé", () => {
        render(shell(false))
        fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }))
        expect(screen.getByTestId("footer-shortcut")).toBeTruthy()
    })

    it("desktop inalterado: sem cabeçalho, sem espaço reservado e com o rodapé do menu", async () => {
        window.innerWidth = 1440
        render(shell())
        await flushFrames()
        expect(screen.queryByTestId("mobile-app-header")).toBeNull()
        expect(screen.queryByRole("button", { name: "Abrir menu" })).toBeNull()
        expect(main().classList.contains("pt-16")).toBe(false)
        expect(screen.getByTestId("footer-shortcut")).toBeTruthy()
    })
})
