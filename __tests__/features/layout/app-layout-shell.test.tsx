/** @vitest-environment happy-dom */

import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { pluginTestEntry, pluginTestRuntime, resetPluginTestRuntime } from '../../helpers/plugins'
import type { IntegrationListItemDto } from "@nandobfer/integracoes"
import { framerMotionMock } from "../../helpers/framer-motion"

const mocks = vi.hoisted(() => ({ useIntegrations: vi.fn() }))

vi.mock("framer-motion", () => framerMotionMock())
// Slots de plugin (OPE-172): sem plugins vigentes, o slot não renderiza nada.
vi.mock("@/features/plugins/hooks/usePlugins", async () => (await import("../../helpers/plugins")).pluginHooksMock())
vi.mock('@/features/plugins/client/PluginContribution', async () => (await import('../../helpers/plugins')).pluginContributionMock())
vi.mock("next/navigation", () => ({ usePathname: () => "/tarefas", useRouter: () => ({ push: vi.fn() }) }))
vi.mock("next/link", () => ({
    default: React.forwardRef<HTMLAnchorElement, { children: React.ReactNode; href: string } & Record<string, unknown>>(function MockLink({ children, href, ...props }, ref) {
        return (
            <a ref={ref} href={href} {...props}>
                {children}
            </a>
        )
    }),
}))
vi.mock("@/lib/pusher/RealtimeStatusBanner", () => ({ RealtimeStatusBanner: () => null }))
vi.mock("@/features/opex-agent/components/agents/AgentChatNavItem", () => ({ AgentChatNavItem: () => <li data-testid="agent-nav-item-mock" /> }))
vi.mock("@/features/host-metrics/components/ServerQuotaSidebarItem", () => ({ ServerQuotaSidebarItem: () => <li data-testid="server-quota-item-mock" /> }))
vi.mock("@nandobfer/integracoes/react", () => ({ useIntegrations: mocks.useIntegrations }))
vi.mock("@nandobfer/integracoes/react", () => ({ useIntegrationStatusLive: vi.fn() }))
vi.mock("@nandobfer/integracoes/react", () => ({ IntegrationTestDialog: () => null }))
vi.mock("@nandobfer/integracoes/react", () => ({ IntegrationDebugDialog: () => null }))

import { AppLayoutShell } from "@/features/layout/components/AppLayoutShell"

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

beforeEach(() => {
    // Desktop: a barra fica recolhida e o item de Integrações usa o submenu.
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 })
    mocks.useIntegrations.mockReturnValue({
        data: [integration({ id: "github", name: "GitHub" }), integration({ id: "pusher", name: "Pusher" })],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
        isRefetching: false,
    })
})
afterEach(cleanup)

describe("AppLayoutShell — menu do dono liga o submenu de Integrações (OPE-120)", () => {
    it("o hover em Integrações abre o submenu com as integrações; o clique continua indo para /integracoes", () => {
        render(
            <AppLayoutShell ownerName="Ana">
                <p>conteúdo</p>
            </AppLayoutShell>,
        )
        const link = screen.getByRole("link", { name: "Integrações" })
        expect(link.getAttribute("href")).toBe("/integracoes")
        expect(screen.queryByTestId("sidebar-item-panel-integrations")).toBeNull()

        fireEvent.pointerEnter(link, { pointerType: "mouse" })
        const panel = screen.getByTestId("sidebar-item-panel-integrations")
        const rows = Array.from(panel.querySelectorAll("li[data-integration-id]")).map((row) => row.getAttribute("data-integration-id"))
        expect(rows).toEqual(["github", "pusher"])
    })

    it("o rodapé do dono mostra \"Servidor e quota\" logo acima do Agente Opex (OPE-145)", () => {
        render(
            <AppLayoutShell ownerName="Ana">
                <p>conteúdo</p>
            </AppLayoutShell>,
        )
        const footer = screen.getByTestId("sidebar-footer-items")
        // O item vazio do slot `topbar.actions` (sem plugins) fica oculto (`empty:hidden`) e não conta.
        const items = Array.from(footer.querySelectorAll("li")).filter((item) => item.childNodes.length > 0 || item.hasAttribute("data-testid")).map((item) => item.getAttribute("data-testid"))
        expect(items).toEqual(["server-quota-item-mock", "agent-nav-item-mock"])
    })
})

describe("AppLayoutShell: plugins (OPE-172)", () => {
    afterEach(resetPluginTestRuntime)
    it("topbar.actions monta no rodapé do menu e o nav do plugin entra na seção Plugins (sidebar.nav)", () => {
        pluginTestRuntime.plugins = [pluginTestEntry("topbar.actions", { pages: [{ path: "hora", title: "Hora", export: "Page" }], nav: [{ label: "Hora certa", page: "hora", icon: "Puzzle" }] })]
        render(
            <AppLayoutShell ownerName="Ana">
                <p>conteúdo</p>
            </AppLayoutShell>,
        )
        expect(document.querySelector('[data-plugin-slot="topbar.actions"] [data-plugin-contribution="relogio:Widget"]')).toBeTruthy()
        expect(screen.getByRole("link", { name: "Hora certa" }).getAttribute("href")).toBe("/x/relogio/hora")
    })
})

describe("AppLayoutShell: item de plugin dentro de um menu (OPE-172, rodada 4)", () => {
    afterEach(resetPluginTestRuntime)
    it("o item com slot sidebar.nav.agentes aparece no painel do grupo Agentes, não na seção Plugins", () => {
        pluginTestRuntime.plugins = [pluginTestEntry(null, { pages: [{ path: "hora", title: "Hora", export: "Page" }], nav: [{ label: "Hora certa", page: "hora", icon: "Puzzle", slot: "sidebar.nav.agentes" }] })]
        render(
            <AppLayoutShell ownerName="Ana">
                <p>conteúdo</p>
            </AppLayoutShell>,
        )
        expect(screen.queryByRole("link", { name: "Hora certa" })).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: "Agentes" }))
        expect(screen.getByRole("link", { name: "Hora certa" }).getAttribute("href")).toBe("/x/relogio/hora")
    })
})
