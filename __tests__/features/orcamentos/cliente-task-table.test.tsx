/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import type { BoardColumnView } from "@/features/tasks/board"
import type { ClienteTaskDto } from "@/features/orcamentos/types"
import { ClienteTaskTable } from "@/features/orcamentos/portal/components/ClienteTaskTable"

const columns: BoardColumnView[] = [
    { key: "todo", label: "A fazer", border: "border-t-sky-400", dot: "bg-sky-400", column: { key: "todo", name: "A fazer", color: "sky", icon: "dot", description: null, wipLimit: null } },
]

const task: ClienteTaskDto = {
    id: "1",
    code: "APP-1",
    columnId: "todo",
    order: 0,
    title: "Corrigir X",
    summary: "Resumo interno",
    taskType: "bugfix",
    priority: "high",
    archived: false,
    project: { id: "p", name: "acme/app", repo: "acme/app", sigla: "APP" },
    estimate: { clientHours: 20, billingBrl: 800 },
    createdAt: null,
    updatedAt: null,
}

describe("ClienteTaskTable (somente leitura)", () => {
    it("mostra as horas do cliente e o faturamento, mas nenhum controle de edição", () => {
        const { container } = render(<ClienteTaskTable tasks={[task]} columns={columns} hrefFor={(item) => `/cliente/tarefa/${item.id}`} />)
        expect(screen.getByText("APP-1")).toBeTruthy()
        expect(screen.getByText("Corrigir X")).toBeTruthy()
        expect(screen.getByText(/20:00/)).toBeTruthy()
        expect(screen.getByText(/800,00/)).toBeTruthy()
        // Sem botões/seleção: o portal é só leitura.
        expect(container.querySelector("button")).toBeNull()
        expect(container.querySelector('input[type="checkbox"]')).toBeNull()
    })

    it("o título é um link para a página da tarefa", () => {
        render(<ClienteTaskTable tasks={[task]} columns={columns} hrefFor={(item) => `/cliente/tarefa/${item.id}`} />)
        const link = screen.getByRole("link", { name: "Corrigir X" })
        expect(link.getAttribute("href")).toBe("/cliente/tarefa/1")
    })
})
