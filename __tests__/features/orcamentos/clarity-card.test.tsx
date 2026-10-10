/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())

import { selectPreviewClarity, type PreviewClarityDto } from "@/features/orcamentos/clarity"
import { ClarityCard } from "@/features/orcamentos/portal/components/preview/ClarityCard"
import { CorrectionCard } from "@/features/orcamentos/portal/components/preview/CorrectionCard"

const clear: PreviewClarityDto = {
    acceptanceCriteria: { status: "clear", detail: null },
    location: { status: "clear", detail: null },
}

describe("card de clareza da prévia", () => {
    it("sucesso: especificação clara e submissão liberada", () => {
        render(<ClarityCard result={selectPreviewClarity(clear)} />)
        expect(screen.getByText("Especificação clara")).toBeTruthy()
        expect(screen.getByText(/Você pode aprovar a tarefa/)).toBeTruthy()
    })

    it("aviso: mostra as dimensões vagas com a dica da IA", () => {
        render(<ClarityCard result={selectPreviewClarity({ ...clear, location: { status: "vague", detail: "não diz a página" } })} />)
        expect(screen.getByText("Especificação pouco clara")).toBeTruthy()
        expect(screen.getByText("localização/página")).toBeTruthy()
        expect(screen.getByText(/não diz a página/)).toBeTruthy()
    })

    it("erro: pede para especificar e orienta o campo de ajuste", () => {
        render(<ClarityCard result={selectPreviewClarity({ ...clear, acceptanceCriteria: { status: "missing", detail: null } })} />)
        expect(screen.getByText("Faltam informações")).toBeTruthy()
        expect(screen.getByText("critérios de aceite")).toBeTruthy()
        expect(screen.getByText(/não foi informado/)).toBeTruthy()
        expect(screen.getByText(/solicitar ajuste/)).toBeTruthy()
    })

    it("o card de ajuste desabilita 'Aprovar tarefa' quando a clareza bloqueia", () => {
        render(
            <CorrectionCard
                value="A página é o rodapé e o critério é X"
                onChange={() => {}}
                onCorrect={() => {}}
                onApprove={() => {}}
                correcting={false}
                approving={false}
                disabled={false}
                approveDisabled
                approveDisabledReason="Especifique critérios de aceite para aprovar a tarefa."
            />,
        )
        const approve = screen.getByRole("button", { name: /Aprovar tarefa/ }) as HTMLButtonElement
        expect(approve.disabled).toBe(true)
        const correct = screen.getByRole("button", { name: /Solicitar correção/ }) as HTMLButtonElement
        expect(correct.disabled).toBe(false)
        expect(screen.getByText(/Especifique critérios de aceite para aprovar/)).toBeTruthy()
    })

    it("libera 'Aprovar tarefa' quando a clareza permite", () => {
        render(<CorrectionCard value="x" onChange={() => {}} onCorrect={() => {}} onApprove={() => {}} correcting={false} approving={false} disabled={false} approveDisabled={false} />)
        const approve = screen.getByRole("button", { name: /Aprovar tarefa/ }) as HTMLButtonElement
        expect(approve.disabled).toBe(false)
    })
})
