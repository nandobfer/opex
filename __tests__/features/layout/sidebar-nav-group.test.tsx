/** @vitest-environment happy-dom */

import React from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Banknote, Clock, Landmark } from "lucide-react"
import { framerMotionMock } from "../../helpers/framer-motion"

const mocks = vi.hoisted(() => ({ pathname: "/tarefas" }))

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }))
vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}))

import { SidebarNavGroup } from "@/features/layout/components/sidebar/SidebarNavGroup"
import { HOVER_POPOVER_CLOSE_DELAY } from "@/features/layout/hooks/useHoverPopover"
import type { NavGroupDef } from "@/features/layout/types"

const GROUP: NavGroupDef = {
    kind: "group",
    id: "contabil",
    label: "Contábil",
    icon: Landmark,
    items: [
        { href: "/tarefas/horas", label: "Horas agênticas", title: "Horas agênticas", icon: Clock },
        { href: "/financeiro", label: "Financeiro", title: "Financeiro", icon: Banknote },
    ],
}

function renderGroup(options: { activeHref?: string | null; onNavigate?: () => void; collapsed?: boolean } = {}) {
    return render(
        <nav aria-label="Menu principal">
            <ul>
                <SidebarNavGroup group={GROUP} activeHref={options.activeHref ?? null} collapsed={options.collapsed ?? true} reduceMotion onNavigate={options.onNavigate} />
            </ul>
        </nav>,
    )
}

const trigger = () => screen.getByRole("button", { name: "Contábil" })
const panel = () => screen.queryByTestId("sidebar-group-panel-contabil")
const mouse = { pointerType: "mouse" }

function wait(ms: number) {
    act(() => {
        vi.advanceTimersByTime(ms)
    })
}

beforeEach(() => {
    mocks.pathname = "/tarefas"
    vi.useFakeTimers()
})
afterEach(() => {
    cleanup()
    vi.useRealTimers()
})

describe("SidebarNavGroup — grupo do menu com painel à direita", () => {
    it("passar o mouse abre o painel fora da barra, com os itens nas rotas certas", () => {
        renderGroup()
        expect(panel()).toBeNull()
        fireEvent.pointerEnter(trigger(), mouse)
        const opened = panel()
        expect(opened).toBeTruthy()
        // Portal: o painel não fica dentro do menu (não é cortado pela rolagem da barra).
        expect(screen.getByRole("navigation").contains(opened)).toBe(false)
        const placed = opened!.closest("[data-side]")
        expect(placed).not.toBeNull()
        expect(placed!.getAttribute("data-side")).toBe("right")
        const links = Array.from(opened!.querySelectorAll("a")).map((a) => [a.textContent, a.getAttribute("href")])
        expect(links).toEqual([
            ["Horas agênticas", "/tarefas/horas"],
            ["Financeiro", "/financeiro"],
        ])
        expect(trigger().getAttribute("aria-expanded")).toBe("true")
    })

    it("gaveta do celular (expandida): o toque abre o painel abaixo do gatilho, limitado à largura disponível", () => {
        renderGroup({ collapsed: false })
        fireEvent.pointerEnter(trigger(), { pointerType: "touch" })
        fireEvent.click(trigger())
        const placed = panel()!.closest("[data-side]")
        expect(placed).not.toBeNull()
        expect(placed!.getAttribute("data-side")).toBe("bottom")
        expect(panel()!.className).toContain("w-56")
        expect(panel()!.className).toContain("max-w-[var(--radix-popover-content-available-width)]")
    })

    it("regressão: entrar no painel ANTES de sair do gatilho mantém aberto; sair do painel fecha após o atraso", () => {
        renderGroup()
        fireEvent.pointerEnter(trigger(), mouse)
        fireEvent.pointerEnter(panel()!, mouse)
        fireEvent.pointerLeave(trigger(), mouse)
        wait(HOVER_POPOVER_CLOSE_DELAY * 3)
        expect(panel()).toBeTruthy()

        fireEvent.pointerLeave(panel()!, mouse)
        wait(HOVER_POPOVER_CLOSE_DELAY - 10)
        expect(panel()).toBeTruthy()
        wait(20)
        expect(panel()).toBeNull()
    })

    it("sair do gatilho e entrar no painel dentro do atraso também mantém aberto", () => {
        renderGroup()
        fireEvent.pointerEnter(trigger(), mouse)
        fireEvent.pointerLeave(trigger(), mouse)
        wait(HOVER_POPOVER_CLOSE_DELAY / 2)
        fireEvent.pointerEnter(panel()!, mouse)
        wait(HOVER_POPOVER_CLOSE_DELAY * 3)
        expect(panel()).toBeTruthy()
    })

    it("toque: o pointerenter do toque não abre sozinho e o clique em seguida abre (sem fechar logo depois)", () => {
        renderGroup()
        fireEvent.pointerEnter(trigger(), { pointerType: "touch" })
        expect(panel()).toBeNull()
        fireEvent.click(trigger())
        expect(panel()).toBeTruthy()
        fireEvent.pointerLeave(trigger(), { pointerType: "touch" })
        wait(HOVER_POPOVER_CLOSE_DELAY * 3)
        expect(panel()).toBeTruthy()
        fireEvent.click(trigger())
        expect(panel()).toBeNull()
    })

    it("clique com o mouse sobre o gatilho mantém o painel aberto (não alterna para fechado)", () => {
        renderGroup()
        fireEvent.pointerEnter(trigger(), mouse)
        fireEvent.click(trigger())
        expect(panel()).toBeTruthy()
    })

    it("teclado: abrir foca o primeiro link, setas percorrem e Esc fecha devolvendo o foco ao gatilho", () => {
        renderGroup()
        trigger().focus()
        fireEvent.click(trigger())
        wait(0)
        const [horas, financeiro] = Array.from(panel()!.querySelectorAll("a"))
        expect(document.activeElement).toBe(horas)
        fireEvent.keyDown(horas!, { key: "ArrowDown" })
        expect(document.activeElement).toBe(financeiro)
        fireEvent.keyDown(financeiro!, { key: "ArrowDown" })
        expect(document.activeElement).toBe(horas)
        fireEvent.keyDown(horas!, { key: "ArrowUp" })
        expect(document.activeElement).toBe(financeiro)

        fireEvent.keyDown(document.activeElement!, { key: "Escape" })
        wait(0)
        expect(panel()).toBeNull()
        expect(document.activeElement).toBe(trigger())
    })

    it("Esc no painel não chega à gaveta do celular (que também fecha com Esc)", () => {
        const drawerEsc = vi.fn()
        document.addEventListener("keydown", drawerEsc)
        renderGroup()
        fireEvent.click(trigger())
        wait(0)
        fireEvent.keyDown(document.activeElement!, { key: "Escape" })
        expect(panel()).toBeNull()
        expect(drawerEsc).not.toHaveBeenCalled()
        document.removeEventListener("keydown", drawerEsc)
    })

    it("escolher um item fecha o painel e avisa a navegação (fecha a gaveta no celular)", () => {
        const onNavigate = vi.fn()
        renderGroup({ onNavigate })
        fireEvent.pointerEnter(trigger(), mouse)
        fireEvent.click(screen.getByRole("link", { name: "Financeiro" }))
        expect(onNavigate).toHaveBeenCalledTimes(1)
        expect(panel()).toBeNull()
    })

    it("rota de um item do grupo: gatilho com a barra de ativo e o link com aria-current", () => {
        renderGroup({ activeHref: "/financeiro" })
        expect(trigger().querySelector("[data-testid='sidebar-active-bar']")).toBeTruthy()
        fireEvent.pointerEnter(trigger(), mouse)
        expect(screen.getByRole("link", { name: "Financeiro" }).getAttribute("aria-current")).toBe("page")
        expect(screen.getByRole("link", { name: "Horas agênticas" }).hasAttribute("aria-current")).toBe(false)
    })

    it("fora do grupo: sem barra de ativo", () => {
        renderGroup({ activeHref: "/tarefas" })
        expect(trigger().querySelector("[data-testid='sidebar-active-bar']")).toBeNull()
    })

    it("mudar de rota fecha o painel aberto", () => {
        const { rerender } = renderGroup()
        fireEvent.click(trigger())
        expect(panel()).toBeTruthy()
        mocks.pathname = "/financeiro"
        rerender(
            <nav aria-label="Menu principal">
                <ul>
                    <SidebarNavGroup group={GROUP} activeHref="/financeiro" collapsed reduceMotion />
                </ul>
            </nav>,
        )
        expect(panel()).toBeNull()
    })
})
