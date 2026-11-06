/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

const mocks = vi.hoisted(() => ({ redirect: vi.fn(), resolve: vi.fn() }))

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/features/orcamentos/server/task-route", () => ({ resolveClienteTaskRoute: mocks.resolve }))
vi.mock("@/features/orcamentos/portal/ClienteTaskDetailPage", () => ({
    ClienteTaskDetailPage: ({ id }: { id: string }) => <div data-testid="cliente-task">{id}</div>,
}))

import ClienteTarefaPage from "@/app/cliente/(portal)/tarefa/[id]/page"

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe("/cliente/tarefa/[código] (OPE-146)", () => {
    it("pelo código, entrega o id resolvido à página da tarefa do portal", async () => {
        mocks.resolve.mockResolvedValue({ kind: "render", id: "65f0a1b2c3d4e5f6a7b8c9d0" })
        render(await ClienteTarefaPage({ params: Promise.resolve({ id: "ope-145" }) }))
        expect(mocks.resolve).toHaveBeenCalledWith("ope-145")
        expect(screen.getByTestId("cliente-task").textContent).toBe("65f0a1b2c3d4e5f6a7b8c9d0")
        expect(mocks.redirect).not.toHaveBeenCalled()
    })

    it("pelo id (URL antiga), redireciona para o código preservando a query string", async () => {
        mocks.resolve.mockResolvedValue({ kind: "redirect", path: "/cliente/tarefa/ope-145" })
        await ClienteTarefaPage({ params: Promise.resolve({ id: "6aee2de28d89a2641930701f" }), searchParams: Promise.resolve({ aba: "anexos" }) })
        expect(mocks.redirect).toHaveBeenCalledWith("/cliente/tarefa/ope-145?aba=anexos")
    })
})
