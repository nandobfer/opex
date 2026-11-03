/** @vitest-environment happy-dom */

import React from "react"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Plug } from "lucide-react"
import type { IntegrationListItemDto } from "@/features/integrations/types"
import type { NavItemDef } from "@/features/layout/types"
import { framerMotionMock } from "../../helpers/framer-motion"

const mocks = vi.hoisted(() => ({ pathname: "/tarefas", useIntegrations: vi.fn(), statusLive: vi.fn(), testDialog: vi.fn(), debugDialog: vi.fn() }))

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
vi.mock("@/features/integrations/hooks/useIntegrations", () => ({ useIntegrations: mocks.useIntegrations }))
vi.mock("@/features/integrations/hooks/useIntegrationStatusLive", () => ({ useIntegrationStatusLive: mocks.statusLive }))
vi.mock("@/features/integrations/components/IntegrationTestDialog", () => ({
    IntegrationTestDialog: (props: { integrationId: string | null }) => {
        mocks.testDialog(props.integrationId)
        return null
    },
}))
vi.mock("@/features/integrations/components/IntegrationDebugDialog", () => ({
    IntegrationDebugDialog: (props: { integrationId: string | null }) => {
        mocks.debugDialog(props.integrationId)
        return null
    },
}))

import { IntegrationsSidebarItem } from "@/features/integrations/components/sidebar/IntegrationsSidebarItem"

const ITEM: NavItemDef = { href: "/integracoes", label: "Integrações", title: "Integrações", icon: Plug, panel: "integrations" }

const integration = (overrides: Partial<IntegrationListItemDto>): IntegrationListItemDto => ({
    id: "pusher",
    name: "Pusher",
    description: "Eventos em tempo real",
    environment: "interno",
    debugMode: false,
    health: { status: "ok" },
    configured: true,
    ...overrides,
})

const LIST = [
    integration({ id: "github", name: "GitHub", health: { status: "error" }, debugMode: true }),
    integration({ id: "ai", name: "Inteligência Artificial", health: { status: "warn" } }),
    integration({ id: "gemini", name: "Gemini", parent: "ai" }),
    integration({ id: "pusher", name: "Pusher", health: { status: "unknown" } }),
]

function listResult(overrides: Record<string, unknown> = {}) {
    return { data: LIST, isLoading: false, isError: false, refetch: vi.fn(), isRefetching: false, ...overrides }
}

function renderItem(onNavigate?: () => void) {
    return render(
        <nav aria-label="Menu principal">
            <ul>
                <IntegrationsSidebarItem item={ITEM} active={false} reduceMotion onNavigate={onNavigate} />
            </ul>
        </nav>,
    )
}

const trigger = () => screen.getByRole("link", { name: "Integrações" })
const panel = () => screen.queryByTestId("sidebar-item-panel-integrations")
const openPanel = () => fireEvent.pointerEnter(trigger(), { pointerType: "mouse" })
const rows = () => Array.from(panel()!.querySelectorAll<HTMLLIElement>("li[data-integration-id]"))

beforeEach(() => {
    vi.clearAllMocks()
    mocks.pathname = "/tarefas"
    mocks.useIntegrations.mockReturnValue(listResult())
})
afterEach(cleanup)

describe("IntegrationsSidebarItem — submenu de Integrações na sidebar (OPE-120)", () => {
    it("o clique em Integrações navega para /integracoes; a lista só é consultada com o submenu aberto", () => {
        renderItem()
        expect(trigger().getAttribute("href")).toBe("/integracoes")
        expect(mocks.useIntegrations).not.toHaveBeenCalled()
        expect(mocks.statusLive).not.toHaveBeenCalled()
        openPanel()
        expect(mocks.useIntegrations).toHaveBeenCalled()
        expect(mocks.statusLive).toHaveBeenLastCalledWith(["github", "ai", "pusher"])
    })

    it("lista as integrações na ordem da página, sem as filhas e sem as em desenvolvimento", () => {
        renderItem()
        openPanel()
        expect(rows().map((row) => row.getAttribute("data-integration-id"))).toEqual(["github", "ai", "pusher"])
        expect(panel()!.textContent).not.toContain("Gemini")
        expect(panel()!.textContent).not.toContain("Google Drive")
    })

    it("cada linha tem a bolinha de status e é um link para a integração, com os botões fora do link", () => {
        renderItem()
        openPanel()
        const [github, ai] = rows()
        expect(github!.querySelector("[data-status]")?.getAttribute("data-status")).toBe("error")
        expect(ai!.querySelector("[data-status]")?.getAttribute("data-status")).toBe("warn")
        const link = within(github!).getByRole("link")
        expect(link.getAttribute("href")).toBe("/integracoes/github")
        expect(link.contains(github!.querySelector("[data-status]"))).toBe(true)
        const test = within(github!).getByRole("button", { name: "Testar conexão" })
        expect(link.contains(test)).toBe(false)
        expect(within(ai!).getByRole("link").getAttribute("href")).toBe("/integracoes/ia")
    })

    it("Testar conexão fecha o submenu e abre o mesmo diálogo da página", () => {
        renderItem()
        openPanel()
        fireEvent.click(within(rows()[0]!).getByRole("button", { name: "Testar conexão" }))
        expect(panel()).toBeNull()
        expect(mocks.testDialog).toHaveBeenLastCalledWith("github")
    })

    it("Debug abre o diálogo de debug; fica desabilitado sem o modo debug", () => {
        renderItem()
        openPanel()
        expect(within(rows()[1]!).getByRole("button", { name: "Debug" }).hasAttribute("disabled")).toBe(true)
        fireEvent.click(within(rows()[0]!).getByRole("button", { name: "Debug" }))
        expect(panel()).toBeNull()
        expect(mocks.debugDialog).toHaveBeenLastCalledWith("github")
    })

    it("escolher uma integração fecha o submenu e avisa a navegação", () => {
        const onNavigate = vi.fn()
        renderItem(onNavigate)
        openPanel()
        fireEvent.click(within(rows()[2]!).getByRole("link"))
        expect(onNavigate).toHaveBeenCalledTimes(1)
        expect(panel()).toBeNull()
    })

    it("a integração da rota atual fica marcada", () => {
        mocks.pathname = "/integracoes/github"
        renderItem()
        openPanel()
        expect(within(rows()[0]!).getByRole("link").getAttribute("aria-current")).toBe("page")
        expect(within(rows()[2]!).getByRole("link").hasAttribute("aria-current")).toBe(false)
    })

    it("carregando: skeleton no formato das linhas", () => {
        mocks.useIntegrations.mockReturnValue(listResult({ data: undefined, isLoading: true }))
        renderItem()
        openPanel()
        const skeleton = screen.getByTestId("integrations-nav-skeleton")
        expect(skeleton.querySelectorAll("li").length).toBe(5)
    })

    it("erro: mensagem e Tentar novamente refaz a consulta", () => {
        const refetch = vi.fn()
        mocks.useIntegrations.mockReturnValue(listResult({ data: undefined, isError: true, refetch }))
        renderItem()
        openPanel()
        expect(panel()!.textContent).toContain("Não foi possível carregar as integrações.")
        fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }))
        expect(refetch).toHaveBeenCalledTimes(1)
    })

    it("vazio: aviso com atalho para a página de Integrações", () => {
        mocks.useIntegrations.mockReturnValue(listResult({ data: [] }))
        renderItem()
        openPanel()
        expect(panel()!.textContent).toContain("Nenhuma integração cadastrada.")
        expect(within(panel()!).getByRole("link", { name: "Abrir Integrações" }).getAttribute("href")).toBe("/integracoes")
    })
})
