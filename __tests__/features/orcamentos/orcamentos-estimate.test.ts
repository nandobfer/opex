import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    stream: vi.fn(),
    jev: vi.fn(),
    tags: vi.fn(),
    similar: vi.fn(),
    saveEstimate: vi.fn(),
    saveTags: vi.fn(),
    loadEstimate: vi.fn(),
    availability: vi.fn(),
}))

type Err = Error & { status: number; code?: string }

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/lib/db/models/Ai", () => ({ AiUsageLog: { create: vi.fn() } }))
vi.mock("@/lib/db/models/Project", () => ({ Project: { findById: () => ({ lean: async () => null }) } }))
vi.mock("@/lib/api/route", () => ({ DomainError: class DomainError extends Error implements Err { status: number; code?: string; constructor(status: number, message: string, code?: string) { super(message); this.status = status; this.code = code } } }))
vi.mock("@/lib/integrations/debug", () => ({ integrationDebug: () => ({ step: vi.fn(), info: vi.fn(), success: vi.fn(), error: vi.fn(), warn: vi.fn(), request: vi.fn(), response: vi.fn() }) }))
vi.mock("@/lib/ai/stream", () => ({ streamAi: mocks.stream, describeAiError: (error: unknown) => (error instanceof Error ? error.message : String(error)) }))
vi.mock("@/lib/ai/jev", () => ({ askJevSystemOne: mocks.jev }))
vi.mock("@/features/ai/server/task-tags", () => ({ generateTagsForInput: mocks.tags }))
vi.mock("@/features/ai/server/settings", () => ({ loadEstimateHoursSettings: mocks.loadEstimate, availabilityOfEstimateHours: mocks.availability }))
vi.mock("@/features/orcamentos/server/similar", () => ({ findSimilarTasks: mocks.similar }))
vi.mock("@/features/orcamentos/server/tag-views", () => ({ resolveTagViews: async (ids: string[]) => ids.map((id) => ({ id, label: id })) }))
vi.mock("@/features/orcamentos/server/portal", () => ({ getDraftDoc: vi.fn(), saveDraftEstimate: mocks.saveEstimate, saveDraftPreview: vi.fn(), saveDraftTags: mocks.saveTags }))

import { DEFAULT_ESTIMATE_HOURS_SETTINGS, type EstimateHoursSettings } from "@/features/ai/schemas"
import { runBudgetEstimate, type BudgetEstimateEvent, type PreparedBudgetEstimate } from "@/features/orcamentos/server/preview"

const settings = (over: Partial<EstimateHoursSettings> = {}): EstimateHoursSettings => ({ ...DEFAULT_ESTIMATE_HOURS_SETTINGS, enabled: true, provider: "gemini", model: "gemini-3-flash", similarLimit: 5, ...over })

const prepared = (over: Partial<PreparedBudgetEstimate> = {}): PreparedBudgetEstimate => ({
    client: { _id: "c1", name: "Acme", profitFactor: 2, hourlyRate: 100 } as PreparedBudgetEstimate["client"],
    draftId: "d1",
    projectId: "p1",
    settings: settings() as PreparedBudgetEstimate["settings"],
    preview: { title: "Ajustar rodapé", taskType: "bugfix", priority: "medium", technicalSpec: "", summary: "Corrige", tags: [] },
    input: { projectName: "acme/app", description: "Corpo", correction: null },
    title: "Orçamento Acme",
    ...over,
})

async function collect(prep: PreparedBudgetEstimate): Promise<BudgetEstimateEvent[]> {
    const events: BudgetEstimateEvent[] = []
    for await (const event of runBudgetEstimate(prep)) events.push(event)
    return events
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.tags.mockResolvedValue(["api"])
    mocks.similar.mockResolvedValue([])
    mocks.saveTags.mockResolvedValue(undefined)
    mocks.saveEstimate.mockImplementation(async (_client: unknown, _id: string, hours: number) => ({ hours, clientHours: hours * 2, billingBrl: 0 }))
    mocks.stream.mockImplementation(async function* () {
        yield { type: "delta", text: '{"estimatedHours":7}' }
        yield { type: "done", finishReason: "stop", durationMs: 5, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, costUsd: null } }
    })
})

describe("runBudgetEstimate (uma chamada, sem agente)", () => {
    it("garante as tags do rascunho, busca semelhantes e estima pelo provedor de texto", async () => {
        const events = await collect(prepared())
        expect(mocks.tags).toHaveBeenCalledOnce()
        expect(mocks.saveTags).toHaveBeenCalledWith(expect.anything(), "d1", ["api"])
        expect(mocks.similar).toHaveBeenCalledWith({ tags: ["api"], taskType: "bugfix", projectId: "p1", limit: 5 })
        expect(mocks.saveEstimate).toHaveBeenCalledWith(expect.anything(), "d1", 7, "gemini/gemini-3-flash")
        expect(events.some((event) => event.type === "notice")).toBe(true)
        const done = events.find((event) => event.type === "done")
        expect(done).toMatchObject({ type: "done", estimate: { hours: 7 }, tags: [{ id: "api", label: "api" }] })
    })

    it("usa o score fracionário do JEV interpolado para horas", async () => {
        mocks.jev.mockResolvedValue({ answers: { estimated_hours: { type: "score", score: 2, confidence: 1, legend: {}, probabilities: {} } } })
        const events = await collect(prepared({ settings: settings({ provider: "jev", model: "jev-latest" }) as PreparedBudgetEstimate["settings"] }))
        expect(mocks.jev).toHaveBeenCalledOnce()
        expect(events.find((event) => event.type === "done")).toMatchObject({ type: "done", estimate: { hours: 0.25 } })
    })

    it("repassa o erro do provedor sem gravar estimativa", async () => {
        mocks.stream.mockImplementation(async function* () {
            yield { type: "error", message: "falhou" }
        })
        const events = await collect(prepared())
        expect(events.find((event) => event.type === "error")).toMatchObject({ type: "error", message: "falhou" })
        expect(mocks.saveEstimate).not.toHaveBeenCalled()
    })
})
