/** @vitest-environment happy-dom */

import React from "react"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"

const navigation = vi.hoisted(() => ({ pathname: "/tarefas" }))

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }))
vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}))
vi.mock("@/lib/pusher/RealtimeStatusBanner", () => ({ RealtimeStatusBanner: () => null }))

import { AppShell } from "@/features/layout/components/AppShell"
import { CONTENT_PADDING_X, CONTENT_PADDING_X_EVEN } from "@/features/layout/content-padding"
import { APP_NAV, EVEN_PADDING_PAGE_HREFS } from "@/features/layout/navigation"

function mainAt(pathname: string, evenPaddingHrefs?: readonly string[]) {
    navigation.pathname = pathname
    const { container } = render(
        <AppShell brand={{ name: "Acme", homeHref: "/tarefas" }} sections={APP_NAV} navLabel="Menu principal" ownerName="Ana" evenPaddingHrefs={evenPaddingHrefs}>
            <p>conteúdo</p>
        </AppShell>,
    )
    const main = container.querySelector("main")
    if (!main) throw new Error("main ausente")
    return main.classList
}

/** Espaçamento em px de uma classe `p{x,y}-N` do Tailwind (N × 4px), por breakpoint. */
function spacingByBreakpoint(classes: string, axis: "x" | "y"): Record<string, number> {
    const out: Record<string, number> = {}
    for (const token of classes.split(/\s+/)) {
        const match = token.match(new RegExp(`^(?:(sm|md|lg|xl|2xl):)?p${axis}-(\\d+)$`))
        if (match) out[match[1] ?? "base"] = Number(match[2]) * 4
    }
    return out
}

afterEach(cleanup)

describe("AppShell — espaçamento do conteúdo (OPE-112)", () => {
    it.each(["/desenvolvimento", "/desenvolvimento/t1"])("em %s o horizontal não passa do vertical no desktop", (pathname) => {
        const classes = mainAt(pathname, EVEN_PADDING_PAGE_HREFS)
        expect(classes.contains("py-6")).toBe(true)
        expect(classes.contains("px-4")).toBe(true)
        expect(classes.contains("md:px-6")).toBe(true)
        expect(classes.contains("lg:px-8")).toBe(false)
    })

    it("as outras telas mantêm o espaçamento padrão", () => {
        const classes = mainAt("/tarefas", EVEN_PADDING_PAGE_HREFS)
        for (const token of CONTENT_PADDING_X.split(" ")) expect(classes.contains(token)).toBe(true)
    })

    it("sem a lista (ex.: portal do cliente), /desenvolvimento mantém o padrão", () => {
        const classes = mainAt("/desenvolvimento")
        expect(classes.contains("lg:px-8")).toBe(true)
    })

    it("o horizontal par é igual ao vertical no desktop e mantém celular e tablet", () => {
        const vertical = spacingByBreakpoint("py-6", "y").base
        const even = spacingByBreakpoint(CONTENT_PADDING_X_EVEN, "x")
        const standard = spacingByBreakpoint(CONTENT_PADDING_X, "x")
        expect(even.md).toBe(vertical)
        expect(even.lg ?? even.md).toBe(vertical)
        expect(even.base).toBe(standard.base)
        expect(even.md).toBe(standard.md)
    })
})
