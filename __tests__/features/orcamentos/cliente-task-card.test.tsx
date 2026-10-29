/** @vitest-environment happy-dom */

import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())

import type { ClienteTaskDto } from "@/features/orcamentos/types"
import { ClienteTaskCard } from "@/features/orcamentos/portal/components/ClienteTaskCard"

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

describe("ClienteTaskCard (portal, somente leitura)", () => {
    it("é um link para a página da tarefa e mostra só o tempo inflado", () => {
        render(<ClienteTaskCard task={task} href="/cliente/tarefa/1?t=token" />)
        const link = screen.getByRole("link")
        expect(link.getAttribute("href")).toBe("/cliente/tarefa/1?t=token")
        expect(screen.getByText(/20:00/)).toBeTruthy()
        expect(screen.getByText(/800,00/)).toBeTruthy()
        // Nunca as horas reais (2 h) na visão do cliente.
        expect(screen.queryByText(/2:00 h/)).toBeNull()
    })
})
