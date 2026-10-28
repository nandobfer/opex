/** @vitest-environment happy-dom */

import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())

import { EstimateBadge } from "@/features/tasks/components/EstimateBadge"
import type { TaskEstimate } from "@/features/tasks/types"

const estimate: TaskEstimate = { hours: 2, clientHours: 20, billingBrl: 800, factor: 10, hourlyRate: 40, model: "gemini/pro", generatedAt: null }

describe("EstimateBadge", () => {
    it("na visão interna mostra as horas reais e o faturamento estimado", () => {
        render(<EstimateBadge estimate={estimate} />)
        expect(screen.getByText("2:00 h")).toBeTruthy()
        expect(screen.getByText("R$ 800,00")).toBeTruthy()
    })

    it("na visão do cliente mostra as horas com o fator e o faturamento", () => {
        render(<EstimateBadge estimate={estimate} mode="client" />)
        expect(screen.getByText("20:00 h · R$ 800,00")).toBeTruthy()
    })

    it("sem cliente (custo/hora zero) mostra só as horas reais, sem o faturamento", () => {
        render(<EstimateBadge estimate={{ ...estimate, clientHours: 2, billingBrl: 0, factor: 1, hourlyRate: 0 }} />)
        expect(screen.getByText("2:00 h")).toBeTruthy()
        expect(screen.queryByText(/R\$/)).toBeNull()
    })

    it("sem estimativa não renderiza nada", () => {
        const { container } = render(<EstimateBadge estimate={null} />)
        expect(container.textContent).toBe("")
    })
})
