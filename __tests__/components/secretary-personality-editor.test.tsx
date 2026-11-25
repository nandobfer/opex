/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())
const mocks = vi.hoisted(() => ({ mutate: vi.fn() }))
vi.mock("@/features/evolution-api/hooks/useEvolution", () => ({ useEvolution: () => ({}), useEvolutionAction: () => ({ mutate: mocks.mutate, isPending: false }) }))
vi.mock("@/features/secretary-agent/components/SecretaryAgentTab", () => ({ SecondaryModel: () => null }))

import { AnalysisProgress, PersonalityEditor } from "@/features/secretary-agent/components/PersonalityTab"
import { emptyPersonality } from "@/features/secretary-agent/personality"

function data(versionId: string, tone: string) {
    const base = emptyPersonality()
    return { versionId, versions: [], snapshot: { base: { blocks: base.blocks.map((block) => (block.key === "tom" ? { ...block, content: tone } : block)) }, variants: [] } }
}
const toneField = () => screen.getByLabelText("Tom e formalidade") as HTMLTextAreaElement

it("mostra o motivo por conversa e encerra a fase ao concluir com falhas", () => {
    const error = "Command Code recusou a chamada (HTTP 400)."
    render(<AnalysisProgress contacts={[]} run={{ _id: "a1", status: "done", phase: "writing", at: "2026-11-25T15:32:11Z", messages: 12, cost: 0.1, discoveries: [], chats: [
        { jid: "1@g.us", state: "read" }, { jid: "2@g.us", state: "failed", error }, { jid: "3@g.us", state: "failed" },
    ] }} />)
    expect(screen.getByText(/Concluída com 2 erros/)).toBeTruthy()
    expect(screen.getByTitle(error).textContent).toBe(error)
    expect(screen.queryByText(/Escrevendo/)).toBeNull()
})

afterEach(() => {
    cleanup()
    mocks.mutate.mockReset()
})

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

    it("o próprio salvamento não dispara o aviso e leva a versão em que a edição se baseou", () => {
        mocks.mutate.mockImplementation((_input: unknown, options: { onSuccess: (saved: { versionId: string }) => void }) => options.onSuccess({ versionId: "v2" }))
        const { rerender } = render(<PersonalityEditor data={data("v1", "Formal")} contacts={[]} />)
        fireEvent.change(toneField(), { target: { value: "Informal" } })
        fireEvent.click(screen.getByRole("button", { name: "Salvar blocos" }))
        expect(mocks.mutate.mock.calls[0]![0]).toMatchObject({ expectedVersionId: "v1" })
        rerender(<PersonalityEditor data={data("v2", "Informal")} contacts={[]} />)
        expect(screen.queryByRole("alert")).toBeNull()
        expect(toneField().value).toBe("Informal")
        expect((screen.getByRole("button", { name: "Salvar blocos" }) as HTMLButtonElement).disabled).toBe(false)
    })

    it("entre o Salvar e o refetch, o texto salvo fica na tela e o que se digita nessa janela não trava o Salvar", () => {
        mocks.mutate.mockImplementation((_input: unknown, options: { onSuccess: (saved: { versionId: string }) => void }) => options.onSuccess({ versionId: "v2" }))
        const { rerender } = render(<PersonalityEditor data={data("v1", "Formal")} contacts={[]} />)
        fireEvent.change(toneField(), { target: { value: "Informal" } })
        fireEvent.click(screen.getByRole("button", { name: "Salvar blocos" }))
        // O refetch ainda não chegou: `data` continua na v1.
        rerender(<PersonalityEditor data={data("v1", "Formal")} contacts={[]} />)
        expect(toneField().value).toBe("Informal")
        fireEvent.change(toneField(), { target: { value: "Informal e direto" } })
        rerender(<PersonalityEditor data={data("v2", "Informal")} contacts={[]} />)
        expect(toneField().value).toBe("Informal e direto")
        expect(screen.queryByRole("alert")).toBeNull()
        expect((screen.getByRole("button", { name: "Salvar blocos" }) as HTMLButtonElement).disabled).toBe(false)
        // Uma versão externa depois disso ainda é detectada.
        rerender(<PersonalityEditor data={data("v3", "Da análise")} contacts={[]} />)
        expect(screen.getByRole("alert")).toBeTruthy()
    })

    it("com versão nova e edição pendente, o Salvar fica travado até recarregar", () => {
        const { rerender } = render(<PersonalityEditor data={data("v1", "Formal")} contacts={[]} />)
        fireEvent.change(toneField(), { target: { value: "Meu texto" } })
        rerender(<PersonalityEditor data={data("v2", "Da análise")} contacts={[]} />)
        expect((screen.getByRole("button", { name: "Salvar blocos" }) as HTMLButtonElement).disabled).toBe(true)
        fireEvent.click(screen.getByRole("button", { name: "Recarregar e descartar minhas edições" }))
        expect((screen.getByRole("button", { name: "Salvar blocos" }) as HTMLButtonElement).disabled).toBe(false)
    })
})
