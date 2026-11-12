/** @vitest-environment happy-dom */

import React from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())
const nav = vi.hoisted(() => ({ pathname: "/tarefas" }))
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }))
vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}))
vi.mock("@/lib/pusher/RealtimeStatusBanner", () => ({ RealtimeStatusBanner: () => null }))

import Link from "next/link"
import { AppShell } from "@/features/layout/components/AppShell"
import { APP_NAV } from "@/features/layout/navigation"

const shell = (footer?: (collapsed: boolean) => React.ReactNode) => (
    <AppShell brand={{ name: "Acme", homeHref: "/tarefas" }} sections={APP_NAV} navLabel="Menu principal" ownerName="Ana" sidebarFooterItems={footer}>
        <p>conteúdo</p>
    </AppShell>
)

function renderShell() {
    return render(shell())
}

const flushFrames = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

beforeEach(() => {
    window.innerWidth = 500
    nav.pathname = "/tarefas"
})
afterEach(cleanup)

describe("AppShell — gaveta do menu e atalho (padrão Shell do DS Sipal)", () => {
    it("sem cabeçalho: só menu e conteúdo; no celular o botão do menu flutua", () => {
        const { container } = renderShell()
        expect(container.querySelector("header")).toBeNull()
        expect(screen.queryByRole("heading", { name: "Tarefas" })).toBeNull()
        expect(screen.getByRole("button", { name: "Abrir menu" }).className).toContain("fixed")
    })

    it("o primeiro link da página pula para o conteúdo", () => {
        renderShell()
        const skip = screen.getByRole("link", { name: "Pular para o conteúdo" })
        expect(skip.getAttribute("href")).toBe("#main-content")
        expect(document.getElementById("main-content")?.tagName).toBe("MAIN")
    })

    it("abre com aria-expanded, foca o primeiro link, deixa o resto inerte e fecha com Esc devolvendo o foco", async () => {
        renderShell()
        const menuButton = screen.getByRole("button", { name: "Abrir menu" })
        expect(menuButton.getAttribute("aria-expanded")).toBe("false")

        fireEvent.click(menuButton)
        expect(menuButton.getAttribute("aria-expanded")).toBe("true")
        expect(screen.getByRole("dialog", { name: "Menu principal" })).toBeTruthy()
        expect(menuButton.closest("[inert]")).not.toBeNull()
        await flushFrames()
        expect(document.activeElement?.textContent).toContain("Tarefas")

        fireEvent.keyDown(document, { key: "Escape" })
        expect(screen.queryByRole("dialog")).toBeNull()
        await flushFrames()
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Abrir menu" }))
    })

    it("fecha pelo botão \"Fechar menu\" e pelo fundo escurecido", () => {
        renderShell()
        fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }))
        fireEvent.click(screen.getByRole("button", { name: "Fechar menu" }))
        expect(screen.queryByRole("dialog")).toBeNull()

        fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }))
        fireEvent.click(screen.getByTestId("sidebar-drawer-backdrop"))
        expect(screen.queryByRole("dialog")).toBeNull()
    })

    it("OPE-161: fecha quando a rota muda por um link fora dos itens do menu (atalho de um painel do rodapé)", () => {
        const footer = () => (
            <li>
                <Link href="/integracoes/ia/opencode" data-testid="footer-shortcut">
                    Configurar OpenCode no host
                </Link>
            </li>
        )
        const { rerender } = render(shell(footer))
        fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }))
        expect(screen.getByRole("dialog", { name: "Menu principal" })).toBeTruthy()
        fireEvent.click(screen.getByTestId("footer-shortcut"))
        expect(screen.getByRole("dialog", { name: "Menu principal" })).toBeTruthy()

        nav.pathname = "/integracoes/ia/opencode"
        rerender(shell(footer))
        expect(screen.queryByRole("dialog")).toBeNull()
        expect(screen.getByRole("button", { name: "Abrir menu" }).getAttribute("aria-expanded")).toBe("false")
    })
})
