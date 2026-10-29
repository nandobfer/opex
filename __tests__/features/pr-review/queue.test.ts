import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_PR_REVIEW_SETTINGS } from "@/features/pr-review/schemas"

const mocks = vi.hoisted(() => ({
    settings: {} as Record<string, unknown>,
    available: true,
    paginate: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    create: vi.fn(),
    targets: vi.fn(),
    login: vi.fn(async (): Promise<string | null> => "eu"),
    workbenches: vi.fn(async () => new Map<string, string>()),
    audit: vi.fn(async () => undefined),
    publish: vi.fn(async () => undefined),
}))

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(), recordAudit: mocks.audit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR' } }))
vi.mock("@/lib/local-user", () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: mocks.publish }))
vi.mock("@/lib/db/models/PrReview", () => ({
    PrReview: {
        findOne: (filter: unknown) => ({ select: () => ({ lean: () => mocks.findOne(filter) }) }),
        findOneAndUpdate: (filter: unknown, update: unknown) => ({ lean: () => mocks.findOneAndUpdate(filter, update) }),
        create: mocks.create,
    },
}))
vi.mock("@/features/github/client", () => ({ githubPaginate: mocks.paginate }))
vi.mock("@/features/ai/server/settings", () => ({
    loadPrReviewSettings: async () => ({ settings: mocks.settings }),
    availabilityOfPrReview: async () => (mocks.available ? { available: true, reason: null } : { available: false, reason: "OpenCode não está conectado" }),
}))
vi.mock("@/features/pr-review/server/targets", () => ({ listReviewTargets: mocks.targets, githubLogin: mocks.login, workbenchPrIndex: mocks.workbenches }))

import { scanPullRequestsForReview } from "@/features/pr-review/server/queue"

const target = { centralId: "c1", projectName: "App", repo: "org/app", config: {} }
const pull = (number: number, overrides: Record<string, unknown> = {}) => ({ number, html_url: `https://github.com/org/app/pull/${number}`, title: `PR ${number}`, draft: false, user: { login: "ana" }, requested_reviewers: [], base: { ref: "main" }, head: { sha: `sha${number}` }, ...overrides })

beforeEach(() => {
    vi.clearAllMocks()
    mocks.settings = { ...DEFAULT_PR_REVIEW_SETTINGS, enabled: true, model: "anthropic/claude" }
    mocks.available = true
    mocks.targets.mockResolvedValue([target])
    mocks.findOne.mockResolvedValue(null)
    mocks.findOneAndUpdate.mockResolvedValue(null)
    mocks.create.mockImplementation(async (doc: Record<string, unknown>) => ({ _id: `r-${doc.number}` }))
})

describe("scanPullRequestsForReview", () => {
    it("enfileira os PRs abertos que atendem ao critério, um por commit", async () => {
        mocks.paginate.mockResolvedValue([pull(1), pull(2, { draft: true })])
        const summary = await scanPullRequestsForReview()
        expect(mocks.paginate).toHaveBeenCalledWith("/repos/org/app/pulls?state=open&per_page=100", { maxPages: 3 })
        expect(mocks.create).toHaveBeenCalledTimes(1)
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ repo: "org/app", number: 1, headSha: "sha1", trigger: "auto", state: "queued", workbenchId: null }))
        expect(summary).toContain("1 revisão(ões) na fila")
        expect(mocks.audit).toHaveBeenCalled()
        expect(mocks.publish).toHaveBeenCalledWith('pr-review-updated', { id: 'r-1' })
    })

    it("commit já revisado não volta para a fila", async () => {
        mocks.paginate.mockResolvedValue([pull(1)])
        mocks.findOne.mockResolvedValue({ _id: "r1" })
        await scanPullRequestsForReview()
        expect(mocks.create).not.toHaveBeenCalled()
        expect(mocks.findOneAndUpdate).not.toHaveBeenCalled()
        expect(mocks.publish).not.toHaveBeenCalled()
    })

    it("novo push com revisão ainda na fila move a revisão para o commit novo", async () => {
        mocks.paginate.mockResolvedValue([pull(1, { head: { sha: "novo" } })])
        mocks.findOneAndUpdate.mockResolvedValue({ _id: "r1" })
        await scanPullRequestsForReview()
        expect(mocks.findOneAndUpdate).toHaveBeenCalledWith({ repo: "org/app", number: 1, state: "queued" }, { $set: expect.objectContaining({ headSha: "novo" }) })
        expect(mocks.create).not.toHaveBeenCalled()
        expect(mocks.publish).toHaveBeenCalledWith('pr-review-updated', { id: 'r1' })
    })

    it("aplica o critério com o usuário do token e marca PR de mesa", async () => {
        mocks.settings = { ...mocks.settings, scope: "not_mine" }
        mocks.workbenches.mockResolvedValue(new Map([["org/app#2", "w2"]]))
        mocks.paginate.mockResolvedValue([pull(1, { user: { login: "eu" } }), pull(2)])
        await scanPullRequestsForReview()
        expect(mocks.create).toHaveBeenCalledTimes(1)
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ number: 2, workbenchId: "w2" }))
    })

    it("desativada ou indisponível não consulta o GitHub", async () => {
        mocks.settings = { ...mocks.settings, enabled: false }
        expect(await scanPullRequestsForReview()).toBe("Agente Revisor desativado")
        mocks.settings = { ...mocks.settings, enabled: true }
        mocks.available = false
        expect(await scanPullRequestsForReview()).toContain("indisponível")
        expect(mocks.paginate).not.toHaveBeenCalled()
    })

    it("falha num repositório não interrompe os demais", async () => {
        mocks.targets.mockResolvedValue([target, { ...target, centralId: "c2", repo: "org/api" }])
        mocks.paginate.mockRejectedValueOnce(new Error("rate limit")).mockResolvedValueOnce([pull(3)])
        const summary = await scanPullRequestsForReview()
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ repo: "org/api", number: 3 }))
        expect(summary).toContain("1 com falha")
    })
})
