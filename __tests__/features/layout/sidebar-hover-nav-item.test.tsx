/** @vitest-environment happy-dom */

import React from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Plug } from "lucide-react"
import { framerMotionMock } from "../../helpers/framer-motion"

const mocks = vi.hoisted(() => ({ pathname: "/tarefas" }))

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }))
vi.mock("next/link", () => ({
    default: React.forwardRef<HTMLAnchorElement, { children: React.ReactNode; href: string } & Record<string, unknown>>(function MockLink({ children, href, ...props }, ref) {
        return (
            <a ref={ref} href={href} {...props}>
                {children}
            </a>
        )
    }),
}))

import { SidebarHoverNavItem } from "@/features/layout/components/sidebar/SidebarHoverNavItem"
import { HOVER_POPOVER_CLOSE_DELAY } from "@/hooks/useHoverPopover"
import type { NavItemDef } from "@/features/layout/types"

const ITEM: NavItemDef = { href: "/integracoes", label: "Integrações", title: "Integrações", icon: Plug, panel: "integrations" }

function renderItem(options: { onNavigate?: () => void; active?: boolean; outside?: React.ReactNode } = {}) {
    return render(
        <nav aria-label="Menu principal">
            <ul>
                <SidebarHoverNavItem
                    item={ITEM}
                    active={options.active ?? false}
                    reduceMotion
                    onNavigate={options.onNavigate}
                    panelWidthClassName="w-72"
                    panel={({ close }) => (
                        <ul>
                            <li>
                                <a href="#github">GitHub</a>
                            </li>
                            <li>
                                <a href="#pusher">Pusher</a>
                                <button type="button" onClick={close}>
                                    Fechar painel
                                </button>
                            </li>
                        </ul>
                    )}
                >
                    {options.outside}
                </SidebarHoverNavItem>
            </ul>
        </nav>,
    )
}

const link = () => screen.getByRole("link", { name: "Integrações" })
const panel = () => screen.queryByTestId("sidebar-item-panel-integrations")
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

describe("SidebarHoverNavItem — item que navega no clique e abre painel no hover", () => {
    it("o item é um link para a rota; o hover abre o painel à direita, fora da barra", () => {
        renderItem()
        expect(link().getAttribute("href")).toBe("/integracoes")
        expect(panel()).toBeNull()
        fireEvent.pointerEnter(link(), mouse)
        const opened = panel()
        expect(opened).toBeTruthy()
        expect(screen.getByRole("navigation").contains(opened)).toBe(false)
        expect(opened!.closest("[data-side]")?.getAttribute("data-side")).toBe("right")
        expect(opened!.className).toContain("w-72")
        expect(opened!.textContent).toContain("Integrações")
        expect(link().getAttribute("aria-expanded")).toBe("true")
    })

    it("clicar no item navega (avisa a navegação) e não alterna o painel para aberto", () => {
        const onNavigate = vi.fn()
        renderItem({ onNavigate })
        fireEvent.click(link())
        expect(onNavigate).toHaveBeenCalledTimes(1)
        expect(panel()).toBeNull()
    })

    it("regressão: entrar no painel ANTES de sair do item mantém aberto; sair do painel fecha após o atraso", () => {
        renderItem()
        fireEvent.pointerEnter(link(), mouse)
        fireEvent.pointerEnter(panel()!, mouse)
        fireEvent.pointerLeave(link(), mouse)
        wait(HOVER_POPOVER_CLOSE_DELAY * 3)
        expect(panel()).toBeTruthy()

        fireEvent.pointerLeave(panel()!, mouse)
        wait(HOVER_POPOVER_CLOSE_DELAY - 10)
        expect(panel()).toBeTruthy()
        wait(20)
        expect(panel()).toBeNull()
    })

    it("tirar o mouse do item fecha o painel após o atraso", () => {
        renderItem()
        fireEvent.pointerEnter(link(), mouse)
        fireEvent.pointerLeave(link(), mouse)
        wait(HOVER_POPOVER_CLOSE_DELAY + 10)
        expect(panel()).toBeNull()
    })

    it("toque não abre o painel", () => {
        renderItem()
        fireEvent.pointerEnter(link(), { pointerType: "touch" })
        expect(panel()).toBeNull()
    })

    it("teclado: seta → abre e foca o primeiro link; Esc fecha e devolve o foco ao item", () => {
        renderItem()
        link().focus()
        fireEvent.keyDown(link(), { key: "ArrowRight" })
        wait(0)
        const [github, pusher] = Array.from(panel()!.querySelectorAll("a"))
        expect(document.activeElement).toBe(github)
        fireEvent.keyDown(github!, { key: "ArrowDown" })
        expect(document.activeElement).toBe(pusher)

        fireEvent.keyDown(document.activeElement!, { key: "Escape" })
        wait(0)
        expect(panel()).toBeNull()
        expect(document.activeElement).toBe(link())
    })

    it("seta → com o painel já aberto pelo mouse leva o foco ao primeiro link", () => {
        renderItem()
        fireEvent.pointerEnter(link(), mouse)
        link().focus()
        fireEvent.keyDown(link(), { key: "ArrowRight" })
        expect(document.activeElement?.textContent).toBe("GitHub")
    })

    it("o conteúdo pode fechar o painel; o que fica fora do painel continua montado", () => {
        renderItem({ outside: <div data-testid="fora-do-painel" /> })
        fireEvent.pointerEnter(link(), mouse)
        fireEvent.click(screen.getByRole("button", { name: "Fechar painel" }))
        expect(panel()).toBeNull()
        expect(screen.getByTestId("fora-do-painel")).toBeTruthy()
    })

    it("item ativo: barra primária e aria-current", () => {
        renderItem({ active: true })
        expect(link().getAttribute("aria-current")).toBe("page")
        expect(link().querySelector("[data-testid='sidebar-active-bar']")).toBeTruthy()
    })

    it("mudar de rota fecha o painel aberto", () => {
        const { rerender } = renderItem()
        fireEvent.pointerEnter(link(), mouse)
        expect(panel()).toBeTruthy()
        mocks.pathname = "/integracoes"
        rerender(
            <nav aria-label="Menu principal">
                <ul>
                    <SidebarHoverNavItem item={ITEM} active reduceMotion panel={() => null} />
                </ul>
            </nav>,
        )
        expect(panel()).toBeNull()
    })
})
