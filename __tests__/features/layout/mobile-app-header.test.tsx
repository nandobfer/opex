/** @vitest-environment happy-dom */

import React, { createRef } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}))

import { MobileAppHeader } from "@/features/layout/components/header/MobileAppHeader"
import { useMobileHeaderFloating } from "@/features/layout/components/header/mobile-header-context"

function Action() {
    const floating = useMobileHeaderFloating()
    return (
        <button type="button" aria-label="Atalho" data-floating={floating || undefined}>
            A
        </button>
    )
}

function renderHeader(compact: boolean, onOpenMenu = vi.fn()) {
    const ref = createRef<HTMLButtonElement>()
    const utils = render(<MobileAppHeader brand={{ name: "Opex", homeHref: "/" }} compact={compact} menuButtonRef={ref} menuOpen={false} drawerId="gaveta" onOpenMenu={onOpenMenu} actions={<Action />} />)
    return { ...utils, ref, onOpenMenu }
}

afterEach(cleanup)

describe("MobileAppHeader (OPE-168)", () => {
    it("no topo: logo leva à home, botão de menu acessível, atalhos à direita e divisor dentro do cabeçalho", () => {
        const { ref, onOpenMenu } = renderHeader(false)
        const header = screen.getByRole("banner", { name: "Cabeçalho" })
        const logo = screen.getByRole("link", { name: "Opex" })
        expect(logo.getAttribute("href")).toBe("/")
        const menu = screen.getByRole("button", { name: "Abrir menu" })
        expect(menu).toBe(ref.current)
        expect(menu.getAttribute("aria-controls")).toBe("gaveta")
        expect(menu.getAttribute("aria-expanded")).toBe("false")
        expect(menu.classList.contains("h-11")).toBe(true)
        fireEvent.click(menu)
        expect(onOpenMenu).toHaveBeenCalledTimes(1)
        expect(header.contains(screen.getByTestId("mobile-app-header-divider"))).toBe(true)
        expect(screen.getByTestId("mobile-app-header-actions").classList.contains("ml-auto")).toBe(true)
        expect(screen.getByRole("button", { name: "Atalho" }).hasAttribute("data-floating")).toBe(false)
        expect(menu.hasAttribute("data-floating")).toBe(false)
    })

    it("recolhido: logo e divisor saem, os botões flutuam sobre o conteúdo e a faixa não captura toques", () => {
        renderHeader(true)
        const header = screen.getByTestId("mobile-app-header")
        expect(header.getAttribute("data-compact")).toBe("true")
        expect(header.classList.contains("pointer-events-none")).toBe(true)
        expect(screen.queryByRole("link", { name: "Opex" })).toBeNull()
        expect(screen.queryByTestId("mobile-app-header-divider")).toBeNull()
        expect(screen.getByRole("button", { name: "Abrir menu" }).hasAttribute("data-floating")).toBe(true)
        expect(screen.getByRole("button", { name: "Atalho" }).hasAttribute("data-floating")).toBe(true)
        expect(screen.getByTestId("mobile-app-header-actions").classList.contains("pointer-events-auto")).toBe(true)
        expect(screen.getByTestId("mobile-app-header-menu-slot").classList.contains("pointer-events-auto")).toBe(true)
    })

    it("a altura do cabeçalho é a mesma nos dois estados (sem pulo de layout)", () => {
        const { unmount } = renderHeader(false)
        const top = screen.getByTestId("mobile-app-header").className
        unmount()
        renderHeader(true)
        expect(screen.getByTestId("mobile-app-header").className).toBe(top)
    })
})
