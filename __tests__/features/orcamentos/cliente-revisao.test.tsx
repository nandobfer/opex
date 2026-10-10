/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())

import { EstimateCard } from "@/features/orcamentos/portal/components/preview/EstimateCard"
import { PreviewTitleCard } from "@/features/orcamentos/portal/components/preview/PreviewTitleCard"
import type { DraftPreviewDto } from "@/features/orcamentos/types"

const preview: DraftPreviewDto = { title: "Ajustar o rodapé", taskType: "bugfix", priority: "medium", technicalSpec: "## Passos", summary: "Corrige o rodapé do site" }

describe("revisão da prévia (portal)", () => {
    it("mostra o nome como título, o resumo como subtítulo e a descrição, sem o texto 'Prévia da IA'", () => {
        render(<PreviewTitleCard preview={preview} description="# Descrição do cliente" generating={false} notice={null} />)
        expect(screen.getByText("Ajustar o rodapé")).toBeTruthy()
        expect(screen.getByText("Corrige o rodapé do site")).toBeTruthy()
        expect(screen.getByText("Descrição do cliente")).toBeTruthy()
        expect(screen.queryByText("Prévia da IA")).toBeNull()
    })

    it("enquanto gera a prévia mostra skeleton e não expõe o JSON cru da IA", () => {
        render(<PreviewTitleCard preview={null} description='{"title":"x"}' generating notice={null} />)
        expect(screen.getByText(/Gerando a prévia/)).toBeTruthy()
        expect(screen.getByLabelText("Gerando prévia")).toBeTruthy()
        expect(screen.queryByText(/"title"/)).toBeNull()
    })

    it("o card de horas mostra o progresso e, depois, as horas e o custo do cliente", () => {
        const { rerender } = render(<EstimateCard estimate={null} estimating status="Consultando (banco)…" error={null} onRetry={() => {}} />)
        expect(screen.getByText("Consultando (banco)…")).toBeTruthy()

        rerender(<EstimateCard estimate={{ hours: 2, clientHours: 20, billingBrl: 800 }} estimating={false} error={null} onRetry={() => {}} />)
        expect(screen.getByText("20:00 h")).toBeTruthy()
        expect(screen.getByText("R$ 800,00")).toBeTruthy()
    })

    it("o card de horas mostra o erro com 'Tentar novamente'", () => {
        render(<EstimateCard estimate={null} estimating={false} error="Falha na estimativa" onRetry={() => {}} />)
        expect(screen.getByText("Falha na estimativa")).toBeTruthy()
        expect(screen.getByRole("button", { name: /Tentar novamente/ })).toBeTruthy()
    })
})
