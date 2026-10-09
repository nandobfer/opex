/** @vitest-environment jsdom */

import React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"
import { INITIAL_UNDERSTAND_STATE, type UnderstandState } from "@/features/ai/understand-stream"

const mocks = vi.hoisted(() => ({ state: null as unknown, start: vi.fn(), stop: vi.fn(), reset: vi.fn() }))

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/ai/hooks/useUnderstandTaskStream", () => ({
    useUnderstandTaskStream: () => ({ state: mocks.state, start: mocks.start, stop: mocks.stop, reset: mocks.reset }),
}))

import { UnderstandTaskDialog } from "@/features/ai/components/understand-task/UnderstandTaskDialog"

const withState = (overrides: Partial<UnderstandState>) => {
    mocks.state = { ...INITIAL_UNDERSTAND_STATE, ...overrides }
}

const renderDialog = () => render(<UnderstandTaskDialog open onOpenChange={() => {}} taskId="t1" title="Entender tarefa GO-DEV-42" />)

beforeEach(() => {
    vi.clearAllMocks()
    withState({})
})

describe("UnderstandTaskDialog", () => {
    it("ao abrir, inicia a geração", () => {
        renderDialog()
        expect(mocks.start).toHaveBeenCalledTimes(1)
        expect(screen.getByText("Entender tarefa GO-DEV-42")).toBeTruthy()
    })

    it("durante o stream mostra o texto parcial, as ferramentas e o botão Parar", () => {
        withState({ status: "running", provider: "opencode", model: "anthropic/claude", agent: "leitor", text: "## Resumo\nExportar pedidos", tools: [{ id: "t", name: "read", state: "running" }] })
        renderDialog()
        expect(screen.getByText("OpenCode · anthropic/claude · agente leitor")).toBeTruthy()
        expect(screen.getByText("Exportar pedidos")).toBeTruthy()
        expect(screen.getByText("read")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Parar" }))
        expect(mocks.stop).toHaveBeenCalled()
        expect(screen.getByRole("button", { name: "Copiar" }).hasAttribute("disabled")).toBe(true)
    })

    it("concluída mostra uso e permite gerar novamente", () => {
        withState({ status: "done", model: "gemini-3-flash", provider: "gemini", text: "Pronto", durationMs: 2500, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: 0.0021 } })
        renderDialog()
        expect(screen.getByText("US$ 0.0021")).toBeTruthy()
        expect(screen.getByText("2,5 s")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Gerar novamente" }))
        expect(mocks.start).toHaveBeenCalledTimes(2)
    })

    it("erro aparece em pt-BR, preservando o texto parcial", () => {
        withState({ status: "error", text: "Parcial", error: "Provedor inacessível: ECONNREFUSED" })
        renderDialog()
        expect(screen.getByRole("alert").textContent).toContain("Provedor inacessível")
        expect(screen.getByText("Parcial")).toBeTruthy()
    })
})
