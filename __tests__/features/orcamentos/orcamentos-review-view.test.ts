import { describe, expect, it } from "vitest"
import { selectReviewView, type BudgetReviewState } from "@/features/orcamentos/portal/useBudgetReview"
import type { OrcamentoDraftDto } from "@/features/orcamentos/types"

const idle: BudgetReviewState = { generatingPreview: false, preview: null, estimating: false, estimate: null, notice: null, error: null }

const persisted: OrcamentoDraftDto = {
    id: "d1",
    projectId: "p1",
    projectName: "acme/app",
    projectRepo: null,
    description: "Ajustar o rodapé",
    correction: null,
    preview: { title: "Corrigir X", taskType: "bugfix", priority: "high", technicalSpec: "## Passos", summary: "Corrige X" },
    model: "gemini/pro",
    status: "draft",
    taskId: null,
    estimate: { hours: 2, clientHours: 20, billingBrl: 800 },
    createdAt: null,
}

describe("selectReviewView (revisão da prévia)", () => {
    it("ocioso, mostra a prévia e a estimativa persistidas no rascunho", () => {
        const view = selectReviewView(idle, persisted, false)
        expect(view.running).toBe(false)
        expect(view.preview).toEqual(persisted.preview)
        expect(view.estimate).toEqual(persisted.estimate)
    })

    it("ao solicitar correção, ignora o cache e mostra skeleton (sem prévia nem estimativa antigas)", () => {
        const view = selectReviewView(idle, persisted, true)
        expect(view.running).toBe(true)
        expect(view.preview).toBeNull()
        expect(view.estimate).toBeNull()
    })

    it("enquanto regenera a prévia, não reaproveita a estimativa antiga do rascunho", () => {
        const view = selectReviewView({ ...idle, generatingPreview: true }, persisted, false)
        expect(view.running).toBe(true)
        expect(view.preview).toBeNull()
        expect(view.estimate).toBeNull()
    })

    it("com a nova prévia pronta e a estimativa em andamento, mostra a nova prévia e a estimativa nula", () => {
        const newPreview = { ...persisted.preview!, title: "Outro título" }
        const view = selectReviewView({ ...idle, preview: newPreview, estimating: true }, persisted, false)
        expect(view.running).toBe(true)
        expect(view.preview).toEqual(newPreview)
        expect(view.estimate).toBeNull()
    })

    it("ao concluir a nova estimativa, entrega o valor novo mesmo com o cache antigo presente", () => {
        const newEstimate = { hours: 3, clientHours: 30, billingBrl: 1200 }
        const state: BudgetReviewState = { ...idle, preview: persisted.preview, estimate: newEstimate }
        const view = selectReviewView(state, persisted, false)
        expect(view.running).toBe(false)
        expect(view.estimate).toEqual(newEstimate)
    })
})
