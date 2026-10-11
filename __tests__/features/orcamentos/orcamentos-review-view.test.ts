import { describe, expect, it, vi } from "vitest"
import { readNdjson, selectReviewView, type BudgetReviewState } from "@/features/orcamentos/review"
import type { OrcamentoDraftDto } from "@/features/orcamentos/types"

const idle: BudgetReviewState = { generatingPreview: false, preview: null, estimating: false, estimate: null, tags: [], notice: null, error: null }

const persisted: OrcamentoDraftDto = {
    id: "d1",
    projectId: "p1",
    projectName: "acme/app",
    projectRepo: null,
    description: "Ajustar o rodapé",
    correction: null,
    preview: { title: "Corrigir X", taskType: "bugfix", priority: "high", technicalSpec: "## Passos", summary: "Corrige X" },
    tags: [{ id: "ia", label: "IA" }],
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
        expect(view.tags).toEqual(persisted.tags)
    })

    it("ao concluir a estimativa, mostra as tags recebidas pelo stream", () => {
        const tags = [{ id: "tarefas", label: "Tarefas" }]
        const view = selectReviewView({ ...idle, tags }, persisted, false)
        expect(view.tags).toEqual(tags)
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

    it("mantém a clareza trazida pelo stream da prévia", () => {
        const clarity = { acceptanceCriteria: { status: "clear" as const, detail: null }, location: { status: "missing" as const, detail: null } }
        const streamPreview = { ...persisted.preview!, clarity }
        const view = selectReviewView({ ...idle, preview: streamPreview, estimating: true }, persisted, false)
        expect(view.preview?.clarity).toEqual(clarity)
    })

    it("sem clareza (prévia vinda do banco), o preview não traz a avaliação", () => {
        const view = selectReviewView(idle, persisted, false)
        expect(view.preview?.clarity).toBeUndefined()
    })
})

describe("readNdjson (transporte compartilhado do portal e do dono)", () => {
    it("lê o NDJSON linha a linha e envia os cabeçalhos e o corpo", async () => {
        const events: unknown[] = []
        const body = '{"type":"start"}\n{"type":"done","estimate":{"hours":2}}\n'
        const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close() } })
        const fetchMock = vi.fn(async () => new Response(stream, { status: 200 }))
        vi.stubGlobal("fetch", fetchMock)

        await readNdjson("/api/tasks/drafts/d1/estimate", { headers: { "x-client-token": "t" }, body: { clientId: "c1" } }, (event) => events.push(event))

        expect(events).toEqual([{ type: "start" }, { type: "done", estimate: { hours: 2 } }])
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/tasks/drafts/d1/estimate",
            expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "x-client-token": "t" }), body: JSON.stringify({ clientId: "c1" }) }),
        )
        vi.unstubAllGlobals()
    })

    it("erro antes do stream vira a mensagem pt-BR do servidor", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Gere a prévia antes de estimar" }), { status: 409 })))
        await expect(readNdjson("/api/tasks/drafts/d1/estimate", {}, () => {})).rejects.toThrow("Gere a prévia antes de estimar")
        vi.unstubAllGlobals()
    })
})
