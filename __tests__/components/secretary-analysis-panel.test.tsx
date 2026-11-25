/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())
const mocks = vi.hoisted(() => ({ runs: [] as unknown[], action: vi.fn() }))
vi.mock("@/features/evolution-api/hooks/useEvolution", () => ({
    useEvolution: (path: string, _enabled: boolean, poll?: number) => (path === "/secretary/analyses" && poll === 15_000 ? { data: mocks.runs } : {}),
    useEvolutionAction: (...args: unknown[]) => { mocks.action(...args); return { mutate: vi.fn(), isPending: false } },
}))

import { ANALYSIS_BACKGROUND_NOTE, ANALYSIS_STARTED_MESSAGE, AnalysisPanel } from "@/features/secretary-agent/components/AnalysisPanel"
import { personalityTabLabel } from "@/features/secretary-agent/hooks/useSecretaryAnalyses"

const run = (status: string, states: string[]) => ({ _id: status, status, phase: "comparing", at: "2026-11-25T16:00:00Z", messages: 10, cost: 0.02, discoveries: [],
    chats: states.map((state, index) => ({ jid: `${index}@s.whatsapp.net`, state, ...(state === "partial" ? { error: "HTTP 400" } : {}) })) })

afterEach(() => {
    cleanup()
    mocks.runs = []
    mocks.action.mockReset()
})

describe("AnalysisPanel", () => {
    it("com análise em andamento, avisa que continua em segundo plano e a mostra primeiro, aberta", () => {
        mocks.runs = [run("done", ["read"]), run("running", ["read", "partial", "queued", "queued"])]
        render(<AnalysisPanel contacts={[]} />)
        expect(screen.getByTestId("analysis-background").textContent).toBe(ANALYSIS_BACKGROUND_NOTE)
        const details = document.querySelectorAll("details")
        expect(details[0]?.hasAttribute("open")).toBe(true)
        expect(details[0]?.textContent).toContain("Em andamento")
        expect(details[0]?.textContent).toContain("2 de 4 conversas lidas")
        expect(screen.getByText(/Lida em parte \(erro\)/)).toBeTruthy()
        expect(mocks.action).toHaveBeenCalledWith("/secretary/analyses", "post", ANALYSIS_STARTED_MESSAGE)
    })

    it("ao remontar, o progresso vem da consulta gravada", () => {
        mocks.runs = [run("running", ["read", "queued"])]
        const first = render(<AnalysisPanel contacts={[]} />)
        first.unmount()
        mocks.runs = [run("running", ["read", "read"])]
        render(<AnalysisPanel contacts={[]} />)
        expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2")
    })

    it("sem análise em andamento, não mostra a linha de segundo plano", () => {
        mocks.runs = [run("done", ["read"])]
        render(<AnalysisPanel contacts={[]} />)
        expect(screen.queryByTestId("analysis-background")).toBeNull()
    })
})

describe("personalityTabLabel", () => {
    it("mostra o progresso da análise em andamento na sub-aba", () => {
        expect(personalityTabLabel(run("running", ["read", "partial", "empty", "queued", "failed"]))).toBe("Personalidade · Analisando 3/5")
        expect(personalityTabLabel(null)).toBe("Personalidade")
    })
})
