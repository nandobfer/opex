/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/evolution-api/hooks/useEvolution", () => ({ useEvolution: () => ({}), useEvolutionAction: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock("@/features/secretary-agent/components/SecretaryAgentTab", () => ({ SecondaryModel: () => null }))

import { PersonalityEditor } from "@/features/secretary-agent/components/PersonalityTab"
import { emptyPersonality } from "@/features/secretary-agent/personality"

function data(versionId: string, tone: string) {
    const base = emptyPersonality()
    return { versionId, versions: [], snapshot: { base: { blocks: base.blocks.map((block) => (block.key === "tom" ? { ...block, content: tone } : block)) }, variants: [] } }
}
const toneField = () => screen.getByLabelText("Tom e formalidade") as HTMLTextAreaElement

afterEach(() => cleanup())

describe("PersonalityEditor", () => {
    it("versão nova sem edição pendente substitui o que está na tela", () => {
        const { rerender } = render(<PersonalityEditor data={data("v1", "Formal")} contacts={[]} />)
        rerender(<PersonalityEditor data={data("v2", "Informal")} contacts={[]} />)
        expect(toneField().value).toBe("Informal")
        expect(screen.queryByRole("alert")).toBeNull()
    })

    it("versão nova com edição pendente mantém o texto digitado e avisa", () => {
        const { rerender } = render(<PersonalityEditor data={data("v1", "Formal")} contacts={[]} />)
        fireEvent.change(toneField(), { target: { value: "Meu texto não salvo" } })
        rerender(<PersonalityEditor data={data("v2", "Da análise")} contacts={[]} />)
        expect(toneField().value).toBe("Meu texto não salvo")
        expect(screen.getByRole("alert").textContent).toContain("A personalidade mudou")
        fireEvent.click(screen.getByRole("button", { name: "Recarregar e descartar minhas edições" }))
        expect(toneField().value).toBe("Da análise")
    })
})
