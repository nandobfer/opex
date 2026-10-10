/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())

import { PreviewTagsCard } from "@/features/orcamentos/portal/components/preview/PreviewTagsCard"

describe("PreviewTagsCard (portal)", () => {
    it("mostra os rótulos das tags da prévia", () => {
        render(<PreviewTagsCard tags={[{ id: "ia", label: "IA" }, { id: "integracoes", label: "Integrações" }]} />)
        expect(screen.getByText("Tags")).toBeTruthy()
        expect(screen.getByText("IA")).toBeTruthy()
        expect(screen.getByText("Integrações")).toBeTruthy()
    })

    it("sem tags e sem carregamento, não renderiza nada", () => {
        const { container } = render(<PreviewTagsCard tags={[]} />)
        expect(container.firstChild).toBeNull()
    })

    it("enquanto carrega, mostra o card com skeleton", () => {
        render(<PreviewTagsCard tags={[]} loading />)
        expect(screen.getByText("Tags")).toBeTruthy()
    })
})
