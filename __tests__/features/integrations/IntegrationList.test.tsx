/** @vitest-environment happy-dom */

import React from "react"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { IntegrationListItemDto } from "@/features/integrations/types"

const mocks = vi.hoisted(() => ({ useIntegrations: vi.fn(), testDialog: vi.fn(), debugDialog: vi.fn() }))

vi.mock("@/features/integrations/hooks/useIntegrationStatusLive", () => ({ useIntegrationStatusLive: vi.fn() }))
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a> }))
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
        motion: { ul: passthrough("ul"), li: passthrough("li"), span: passthrough("span"), div: passthrough("div") },
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
        const row = screen.getByText("Pusher").closest("li")!
        expect(within(row).getByText("Eventos em tempo real para as telas do app")).toBeTruthy()
        expect(within(row).getByText("Interno")).toBeTruthy()
        expect(within(screen.getByText("Crons").closest("li")!).getByText("Externo")).toBeTruthy()
    })

    it("Debug fica desabilitado quando o modo debug está desligado", () => {
        mocks.useIntegrations.mockReturnValue({ data: [item({ debugMode: false })], isLoading: false })
        render(<IntegrationList />)
        const debug = screen.getByRole("button", { name: "Debug" })
        expect(debug.hasAttribute("disabled")).toBe(true)
    })

    it("o card inteiro é um link para a página da integração; testar e debug abrem os modais", () => {
        mocks.useIntegrations.mockReturnValue({ data: [item({ debugMode: true })], isLoading: false })
        render(<IntegrationList />)

        expect(screen.getByText("Pusher").closest("a")!.getAttribute("href")).toBe("/integracoes/pusher")

        fireEvent.click(screen.getByRole("button", { name: "Testar conexão" }))
        expect(mocks.testDialog).toHaveBeenLastCalledWith("pusher")

        fireEvent.click(screen.getByRole("button", { name: "Debug" }))
        expect(mocks.debugDialog).toHaveBeenLastCalledWith("pusher")
    })

    it("provedores de IA (integrações-filhas) ficam fora da lista; o hub aparece e abre /integracoes/ia", () => {
        mocks.useIntegrations.mockReturnValue({
            data: [item({ id: "ai", name: "Inteligência Artificial" }), item({ id: "ai_opencode", name: "OpenCode", parent: "ai" }), item({ id: "ai_gemini", name: "Gemini", parent: "ai" })],
            isLoading: false,
        })
        render(<IntegrationList />)
        expect(screen.queryByText("OpenCode")).toBeNull()
        expect(screen.queryByText("Gemini")).toBeNull()
        expect(within(screen.getByText("Inteligência Artificial").closest("li")!).getByText("Inteligência Artificial").closest("a")!.getAttribute("href")).toBe("/integracoes/ia")
    })

    it("Google Drive aparece como Em desenvolvimento (fonte de tarefas do Google Sheets), sem ações nem link", () => {
        mocks.useIntegrations.mockReturnValue({ data: [], isLoading: false })
        render(<IntegrationList />)
        const row = screen.getByText("Google Drive").closest("li")!
        expect(within(row).getByText("Em desenvolvimento")).toBeTruthy()
        expect(within(row).getByText("Fonte de tarefas a partir de planilhas do Google Sheets")).toBeTruthy()
        expect(within(row).queryAllByRole("button")).toHaveLength(0)
        expect(within(row).queryByRole("link")).toBeNull()
        expect(screen.queryByText("Archflow")).toBeNull()
    })

    it("erro ao carregar mostra mensagem em pt-BR", () => {
        mocks.useIntegrations.mockReturnValue({ data: undefined, isLoading: false, isError: true })
        render(<IntegrationList />)
        expect(screen.getByText("Não foi possível carregar as integrações.")).toBeTruthy()
    })
})
