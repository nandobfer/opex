/** @vitest-environment happy-dom */

import React, { useEffect } from "react"
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
import { APP_NAV, PERSISTENT_PAGE_HREFS } from "@/features/layout/navigation"

function Page({ onMount }: { onMount: () => void }) {
    useEffect(onMount, [onMount])
    return <p>conteúdo</p>
}

function renderAt(pathname: string) {
    navigation.pathname = pathname
    const onMount = vi.fn()
    const shell = () => (
        <AppShell brand={{ name: "Acme", homeHref: "/tarefas" }} sections={APP_NAV} navLabel="Menu principal" ownerName="Ana" persistentHrefs={PERSISTENT_PAGE_HREFS}>
            <Page onMount={onMount} />
        </AppShell>
    )
    const view = render(shell())
    return {
        onMount,
        navigate: (next: string) => {
            navigation.pathname = next
            view.rerender(shell())
        },
    }
}

afterEach(cleanup)

describe("AppShell — transição de página", () => {
    it("trocar de tarefa ou de central na Central de desenvolvimento não remonta a página", () => {
        const { onMount, navigate } = renderAt("/desenvolvimento/c1/t1")
        navigate("/desenvolvimento/c1/t2")
        navigate("/desenvolvimento/c2/t3")
        expect(onMount).toHaveBeenCalledTimes(1)
    })

    it("trocar de tela continua trocando a página", () => {
        const { onMount, navigate } = renderAt("/tarefas")
        navigate("/integracoes")
        expect(onMount).toHaveBeenCalledTimes(2)
    })
})
