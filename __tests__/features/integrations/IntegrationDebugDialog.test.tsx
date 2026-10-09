/** @vitest-environment jsdom */

import React from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), startTest: vi.fn(), testState: "idle" as string }))

vi.mock("@/features/integrations/hooks/useIntegrationDebugLogs", () => ({
    useIntegrationDebugLogs: () => ({ mode: "realtime", loading: false, error: null, refresh: mocks.refresh }),
}))
vi.mock("@/features/integrations/hooks/useIntegrationTestStream", () => ({
    useIntegrationTestStream: () => ({ state: mocks.testState, start: mocks.startTest, cancel: vi.fn() }),
}))
vi.mock("@/features/integrations/components/IntegrationConsole", () => ({
    SEARCH_HIGHLIGHT_LIMIT: 1000,
    IntegrationConsole: React.forwardRef(function Console() {
        return <div data-testid="console" />
    }),
}))

import { IntegrationDebugDialog } from "@/features/integrations/components/IntegrationDebugDialog"

beforeEach(() => {
    vi.clearAllMocks()
    mocks.testState = "idle"
    mocks.startTest.mockResolvedValue(undefined)
})

describe("IntegrationDebugDialog", () => {
    it("barra na ordem Tempo real → Testar → Atualizar → Fechar, com um único Fechar visível e sem Maximizar", () => {
        render(<IntegrationDebugDialog integrationId="pusher" onOpenChange={vi.fn()} />)

        const dialog = screen.getByRole("dialog")
        const atualizar = screen.getByRole("button", { name: "Atualizar" })
        const fechar = screen.getByRole("button", { name: "Fechar" })
        const indicador = screen.getByText("Tempo real")
        const testar = screen.getByRole("button", { name: "Testar conexão" })

        // Mesmo contêiner de controles, na ordem pedida.
        const controls = atualizar.closest("div.flex.shrink-0")!
        expect(controls.contains(fechar)).toBe(true)
        expect(controls.contains(indicador)).toBe(true)
        const order = (el: Element) => Array.from(controls.querySelectorAll("*")).indexOf(el)
        expect(order(indicador)).toBeLessThan(order(testar))
        expect(order(testar)).toBeLessThan(order(atualizar))
        expect(order(atualizar)).toBeLessThan(order(fechar))
        // Maximizar existe só no formulário da integração.
        expect(screen.queryByRole("button", { name: "Maximizar" })).toBeNull()

        // O X absoluto do core fica oculto só neste modal.
        expect(dialog.className).toContain("[&>button:last-child]:hidden")
    })

    it("sem texto na busca, Esc fecha o modal direto", () => {
        const onOpenChange = vi.fn()
        render(<IntegrationDebugDialog integrationId="pusher" onOpenChange={onOpenChange} />)
        act(() => (screen.getByLabelText("Buscar nos logs") as HTMLInputElement).focus())
        fireEvent.keyDown(screen.getByLabelText("Buscar nos logs"), { key: "Escape" })
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it("Esc com texto na busca só limpa a busca, sem fechar o modal", () => {
        const onOpenChange = vi.fn()
        render(<IntegrationDebugDialog integrationId="pusher" onOpenChange={onOpenChange} />)
        const input = screen.getByLabelText("Buscar nos logs") as HTMLInputElement
        fireEvent.change(input, { target: { value: "erro" } })
        fireEvent.keyDown(input, { key: "Escape" })
        expect(input.value).toBe("")
        expect(onOpenChange).not.toHaveBeenCalled()
    })

    it("título Logs e barra de busca no modal", () => {
        render(<IntegrationDebugDialog integrationId="pusher" onOpenChange={vi.fn()} />)
        expect(screen.getByText(/^Logs — /)).toBeTruthy()
        expect(screen.getByLabelText("Buscar nos logs")).toBeTruthy()
    })

    it("Fechar fecha o modal", () => {
        const onOpenChange = vi.fn()
        render(<IntegrationDebugDialog integrationId="pusher" onOpenChange={onOpenChange} />)
        fireEvent.click(screen.getByRole("button", { name: "Fechar" }))
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it("Testar roda no próprio terminal (sem abrir outro modal) e depois busca os eventos novos", async () => {
        vi.useFakeTimers()
        try {
            render(<IntegrationDebugDialog integrationId="pusher" onOpenChange={vi.fn()} />)
            fireEvent.click(screen.getByRole("button", { name: "Testar conexão" }))
            expect(mocks.startTest).toHaveBeenCalledTimes(1)
            expect(screen.getAllByRole("dialog")).toHaveLength(1)
            await vi.advanceTimersByTimeAsync(1000)
            expect(mocks.refresh).toHaveBeenCalledTimes(1)
        } finally {
            vi.useRealTimers()
        }
    })

    it("Testar fica desabilitado enquanto o teste roda", () => {
        mocks.testState = "running"
        render(<IntegrationDebugDialog integrationId="pusher" onOpenChange={vi.fn()} />)
        expect(screen.getByRole("button", { name: "Testar conexão" }).hasAttribute("disabled")).toBe(true)
    })
})
