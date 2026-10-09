/** @vitest-environment jsdom */

import React from "react"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { IntegrationListItemDto } from "@/features/integrations/types"

const mocks = vi.hoisted(() => ({ push: vi.fn(), useIntegrations: vi.fn(), testDialog: vi.fn(), debugDialog: vi.fn() }))

vi.mock("@/features/integrations/hooks/useIntegrationStatusLive", () => ({ useIntegrationStatusLive: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("@/features/integrations/hooks/useIntegrations", () => ({ useIntegrations: mocks.useIntegrations }))
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
vi.mock("framer-motion", () => {
    const MOTION_PROPS = new Set(["initial", "animate", "exit", "variants", "transition", "whileTap", "layout"])
    const passthrough = (tag: string) =>
        function Motion({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) {
            const domProps = Object.fromEntries(Object.entries(props).filter(([key]) => !MOTION_PROPS.has(key)))
            return React.createElement(tag, domProps, children)
        }
    return {
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: { tbody: passthrough("tbody"), tr: passthrough("tr"), span: passthrough("span"), div: passthrough("div") },
    }
})

import { IntegrationList } from "@/features/integrations/components/IntegrationList"

const item = (overrides: Partial<IntegrationListItemDto>): IntegrationListItemDto => ({
    id: "pusher",
    name: "Pusher",
    description: "Eventos em tempo real para as telas do app",
    environment: "interno",
    debugMode: false,
    health: { status: "ok" },
    configured: true,
    ...overrides,
})

beforeEach(() => {
    vi.clearAllMocks()
})

describe("IntegrationList", () => {
    it("mostra nome, descrição e ambiente de cada integração", () => {
        mocks.useIntegrations.mockReturnValue({
            data: [item({}), item({ id: "crons", name: "Crons", description: "Rotinas", environment: "externo" })],
            isLoading: false,
        })
        render(<IntegrationList />)
        const row = screen.getByText("Pusher").closest("tr")!
        expect(within(row).getByText("Eventos em tempo real para as telas do app")).toBeTruthy()
        expect(within(row).getByText("Interno")).toBeTruthy()
        expect(within(screen.getByText("Crons").closest("tr")!).getByText("Externo")).toBeTruthy()
    })

    it("Debug fica desabilitado quando o modo debug está desligado", () => {
        mocks.useIntegrations.mockReturnValue({ data: [item({ debugMode: false })], isLoading: false })
        render(<IntegrationList />)
        const debug = screen.getByRole("button", { name: "Debug" })
        expect(debug.hasAttribute("disabled")).toBe(true)
    })

    it("editar navega para a página da integração; testar e debug abrem os modais", () => {
        mocks.useIntegrations.mockReturnValue({ data: [item({ debugMode: true })], isLoading: false })
        render(<IntegrationList />)

        fireEvent.click(screen.getByRole("button", { name: "Editar" }))
        expect(mocks.push).toHaveBeenCalledWith("/integracoes/pusher")

        fireEvent.click(screen.getByRole("button", { name: "Testar conexão" }))
        expect(mocks.testDialog).toHaveBeenLastCalledWith("pusher")

        fireEvent.click(screen.getByRole("button", { name: "Debug" }))
        expect(mocks.debugDialog).toHaveBeenLastCalledWith("pusher")
    })

    it("provedores de IA (integrações-filhas) ficam fora da lista; o hub aparece e abre /integracoes/ia", () => {
        mocks.useIntegrations.mockReturnValue({
            data: [item({ id: "ai", name: "Provedores de IA" }), item({ id: "ai_opencode", name: "OpenCode", parent: "ai" }), item({ id: "ai_gemini", name: "Gemini", parent: "ai" })],
            isLoading: false,
        })
        render(<IntegrationList />)
        expect(screen.queryByText("OpenCode")).toBeNull()
        expect(screen.queryByText("Gemini")).toBeNull()
        fireEvent.click(within(screen.getByText("Provedores de IA").closest("tr")!).getByRole("button", { name: "Editar" }))
        expect(mocks.push).toHaveBeenCalledWith("/integracoes/ia")
    })

    it("Archflow aparece como Em desenvolvimento, sem ações", () => {
        mocks.useIntegrations.mockReturnValue({ data: [], isLoading: false })
        render(<IntegrationList />)
        for (const name of ["Archflow"]) {
            const row = screen.getByText(name).closest("tr")!
            expect(within(row).getByText("Em desenvolvimento")).toBeTruthy()
            expect(within(row).queryAllByRole("button")).toHaveLength(0)
        }
    })

    it("erro ao carregar mostra mensagem em pt-BR", () => {
        mocks.useIntegrations.mockReturnValue({ data: undefined, isLoading: false, isError: true })
        render(<IntegrationList />)
        expect(screen.getByText("Não foi possível carregar as integrações.")).toBeTruthy()
    })
})
