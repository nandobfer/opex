/** @vitest-environment jsdom */

import React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ settings: vi.fn(), dialog: vi.fn() }))

vi.mock("@/features/ai/hooks/useAi", () => ({ useAiFeatureRealtime: vi.fn(), useUnderstandTaskSettings: mocks.settings }))
vi.mock("@/features/ai/components/understand-task/UnderstandTaskDialog", () => ({
    UnderstandTaskDialog: (props: { open: boolean; taskId: string; title: string }) => {
        mocks.dialog(props)
        return null
    },
}))

import { UnderstandTaskButton } from "@/features/ai/components/understand-task/UnderstandTaskButton"

beforeEach(() => vi.clearAllMocks())

describe("UnderstandTaskButton", () => {
    it("no rascunho, usa o rótulo próprio e abre o modal com o id draft-…", () => {
        mocks.settings.mockReturnValue({ data: { availability: { available: true, reason: null } }, isError: false })
        render(<UnderstandTaskButton taskId="draft-0123456789abcdef01234567" taskCode="GH-7" label="Entender rascunho" />)
        fireEvent.click(screen.getByRole("button", { name: "Entender rascunho" }))
        expect(mocks.dialog).toHaveBeenLastCalledWith(expect.objectContaining({ open: true, taskId: "draft-0123456789abcdef01234567", title: "Entender rascunho GH-7" }))
    })

    it("é um botão só de ícone, com o rótulo como nome acessível", () => {
        mocks.settings.mockReturnValue({ data: { availability: { available: true, reason: null } }, isError: false })
        render(<UnderstandTaskButton taskId="t1" taskCode="GO-DEV-1" />)
        const button = screen.getByRole("button", { name: "Entender tarefa" })
        expect(button.textContent).toBe("")
        expect(button.querySelector("svg")).toBeTruthy()
    })

    it("indisponível fica bloqueado (focável, para a dica) e não abre o modal", () => {
        mocks.settings.mockReturnValue({ data: { availability: { available: false, reason: "Gemini não está conectado" } }, isError: false })
        render(<UnderstandTaskButton taskId="t1" taskCode="GO-DEV-1" />)
        const button = screen.getByRole("button", { name: "Entender tarefa" })
        expect(button.getAttribute("aria-disabled")).toBe("true")
        fireEvent.click(button)
        expect(mocks.dialog).not.toHaveBeenCalledWith(expect.objectContaining({ open: true }))
    })
})
