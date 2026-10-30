/** @vitest-environment happy-dom */
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())

import { MarkdownResourceForm } from "@/features/opencode-resources/components/MarkdownResourceForm"

const empty = { name: "", description: "", mode: "" as const, model: "", agent: "", subtask: false, body: "" }

afterEach(cleanup)

describe("formulário de skill/agente/comando", () => {
    it("bloqueia salvar com frontmatter inválido e mostra o erro em pt-BR", async () => {
        const onSubmit = vi.fn()
        render(<MarkdownResourceForm kind="skill" initial={empty} creating pending={false} onSubmit={onSubmit} onCancel={vi.fn()} />)
        fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Nome Inválido" } })
        await waitFor(() => expect(screen.getByText(/Nome inválido/)).toBeTruthy())
        expect(screen.getByRole("button", { name: "Criar" }).hasAttribute("disabled")).toBe(true)
        expect(onSubmit).not.toHaveBeenCalled()
    })

    it("com nome e descrição válidos libera salvar", async () => {
        const onSubmit = vi.fn()
        render(<MarkdownResourceForm kind="agent" initial={{ ...empty, name: "rev" }} creating pending={false} onSubmit={onSubmit} onCancel={vi.fn()} />)
        fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Revisa código" } })
        await waitFor(() => expect(screen.getByRole("button", { name: "Criar" }).hasAttribute("disabled")).toBe(false))
        fireEvent.click(screen.getByRole("button", { name: "Criar" }))
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "rev", description: "Revisa código" }), expect.anything()))
    })
})
