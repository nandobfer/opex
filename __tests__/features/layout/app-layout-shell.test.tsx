/** @vitest-environment happy-dom */

import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { IntegrationListItemDto } from "@/features/integrations/types"
import { framerMotionMock } from "../../helpers/framer-motion"

const mocks = vi.hoisted(() => ({ useIntegrations: vi.fn() }))

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("next/navigation", () => ({ usePathname: () => "/tarefas" }))
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
vi.mock("@/features/opex-agent/components/agents/AgentChatNavItem", () => ({ AgentChatNavItem: () => null }))
vi.mock("@/features/integrations/hooks/useIntegrations", () => ({ useIntegrations: mocks.useIntegrations }))
vi.mock("@/features/integrations/hooks/useIntegrationStatusLive", () => ({ useIntegrationStatusLive: vi.fn() }))
vi.mock("@/features/integrations/components/IntegrationTestDialog", () => ({ IntegrationTestDialog: () => null }))
vi.mock("@/features/integrations/components/IntegrationDebugDialog", () => ({ IntegrationDebugDialog: () => null }))

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
})
