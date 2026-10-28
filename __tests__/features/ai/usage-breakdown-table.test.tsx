/** @vitest-environment happy-dom */
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())

import { UsageBreakdownTable } from "@/features/ai/components/UsageBreakdownTable"

const rows = [
    { key: "task-tags", label: "Tags de tarefas", requests: 2, inputTokens: 1200, outputTokens: null, totalTokens: 1350, costUsd: 0.0000042 },
    { key: "estimate-hours", label: "Estimar prazos", requests: 1, inputTokens: null, outputTokens: null, totalTokens: 50, costUsd: null },
]
const total = { requests: 3, inputTokens: 1200, outputTokens: null, totalTokens: 1400, costUsd: 0.0000042 }

afterEach(cleanup)

describe("UsageBreakdownTable", () => {
    it("monta o cabeçalho com o rótulo recebido e uma linha por recurso", () => {
        render(<UsageBreakdownTable firstColumnLabel="Recurso" rows={rows} total={total} />)
        expect(screen.getByRole("columnheader", { name: "Recurso" })).toBeTruthy()
        expect(screen.getByRole("columnheader", { name: "Chamadas" })).toBeTruthy()
        expect(screen.getByRole("columnheader", { name: "Custo (USD)" })).toBeTruthy()
        expect(screen.getByText("Tags de tarefas")).toBeTruthy()
        expect(screen.getByText("Estimar prazos")).toBeTruthy()
        expect(screen.getAllByText("1.200")).toHaveLength(2)
        expect(screen.getByText("1.350")).toBeTruthy()
        expect(screen.getAllByText(/0,0000042/).length).toBeGreaterThan(0)
    })

    it("exibe métrica não informada como — e destaca a linha de total", () => {
        render(<UsageBreakdownTable firstColumnLabel="Origem" rows={rows} total={total} />)
        expect(screen.getAllByTitle("Métrica não informada").length).toBe(5)
        const totalRow = screen.getAllByText("Total").map((element) => element.closest("tr")).find((row) => row?.className.includes("font-semibold"))!
        expect(totalRow.className).toContain("font-semibold")
        expect(totalRow.textContent).toContain("3")
        expect(totalRow.textContent).toContain("1.400")
    })
})
