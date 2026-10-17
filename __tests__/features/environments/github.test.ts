import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { IEnvironmentOperation } from "@/lib/db/models/EnvironmentOperation"
const mocks = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock("@/features/github/client", () => ({ githubRequest: mocks.request }))
vi.mock("@/features/environments/server/access", () => ({ accessibleProject: async () => ({ repo: "org/app" }) }))
vi.mock("@/lib/db/models/EnvironmentOperation", async () => ({
    EnvironmentOperation: (await import("./fixtures")).store.op,
}))
import { dispatchAndWatch, ciCd } from "@/features/environments/server/github"
import { resetStore, seedOperation, store, repoId } from "./fixtures"
const operation = () => store.op.docs[0] as unknown as IEnvironmentOperation & { _id: unknown }
const run = () => ({
    id: 42,
    name: "Deploy",
    head_sha: "abc",
    created_at: new Date().toISOString(),
    html_url: "https://github.com/run/42",
    status: "completed",
    conclusion: "success",
})

beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    seedOperation()
    vi.useFakeTimers()
    store.op.docs[0].repoConfig = { workflow: "deploy.yml" }
})
afterEach(() => vi.useRealTimers())
describe("correlação e retomada de CD", () => {
    it("lista workflows paginados e usa filtros/página nos runs", async () => {
        mocks.request
            .mockResolvedValueOnce({ total_count: 2, workflows: [{ id: 1, name: "CI" }] })
            .mockResolvedValueOnce({ workflow_runs: [run()] })
            .mockResolvedValueOnce({ workflows: [{ id: 2, name: "Deploy" }] })
        const actor = { userId: "local", clientId: null, projectIds: null, canEdit: true, owner: true }
        const result = await ciCd(actor, repoId, "deploy.yml", "release/a", 2)
        expect(result.workflows.map((workflow) => workflow.name)).toEqual(["CI", "Deploy"])
        expect(mocks.request.mock.calls[1][0]).toContain("page=2")
        expect(mocks.request.mock.calls[1][0]).toContain("branch=release%2Fa")
        expect(result.hasNext).toBe(false)
    })
    it("sinal já interrompido não dispara workflow", async () => {
        const controller = new AbortController()
        controller.abort()
        await expect(dispatchAndWatch(operation(), controller.signal)).rejects.toThrow()
        expect(mocks.request).not.toHaveBeenCalled()
    })
    it("persiste intenção antes de disparar e acompanha somente o run correlacionado", async () => {
        mocks.request
            .mockResolvedValueOnce({ commit: { sha: "abc" } })
            .mockImplementationOnce(async () => {
                expect(store.op.docs[0].cdDispatched).toBe(true)
                return null
            })
            .mockResolvedValueOnce({ workflow_runs: [run()] })
            .mockResolvedValueOnce(run())
        const pending = dispatchAndWatch(operation(), new AbortController().signal)
        await vi.runAllTimersAsync()
        expect(await pending).toMatchObject({ runId: 42, sha: "abc" })
        expect(mocks.request.mock.calls.filter(([, opts]) => opts?.method === "POST")).toHaveLength(1)
        expect(store.op.docs[0].runId).toBe(42)
    })
    it("run salvo retoma após reinício sem workflow_dispatch", async () => {
        store.op.docs[0].runId = 42
        store.op.docs[0].cdDispatched = true
        mocks.request.mockResolvedValue(run())
        await expect(dispatchAndWatch(operation(), new AbortController().signal, true)).resolves.toMatchObject({
            runId: 42,
        })
        expect(mocks.request).toHaveBeenCalledTimes(1)
        expect(mocks.request.mock.calls[0][0]).toContain("/actions/runs/42")
    })
    it("disparo sem run identificado procura o original, nunca redispara", async () => {
        store.op.docs[0].cdDispatched = true
        store.op.docs[0].expectedSha = "abc"
        store.op.docs[0].cdRequestedAt = new Date()
        mocks.request.mockResolvedValueOnce({ workflow_runs: [run()] }).mockResolvedValueOnce(run())
        const pending = dispatchAndWatch(operation(), new AbortController().signal, true)
        await vi.runAllTimersAsync()
        await pending
        expect(mocks.request.mock.calls.every(([, opts]) => opts?.method !== "POST")).toBe(true)
    })
    it("mais de um run possível bloqueia sem escolher arbitrariamente", async () => {
        store.op.docs[0].cdDispatched = true
        store.op.docs[0].expectedSha = "abc"
        store.op.docs[0].cdRequestedAt = new Date()
        mocks.request.mockResolvedValue({ workflow_runs: [run(), { ...run(), id: 43 }] })
        const pending = expect(dispatchAndWatch(operation(), new AbortController().signal, true)).rejects.toThrow(
            "mais de um run",
        )
        await vi.runAllTimersAsync()
        await pending
        expect(store.op.docs[0].runId).toBeNull()
    })
    it("workflow falho não comprova publicação; reconciliação só observa", async () => {
        store.op.docs[0].runId = 42
        mocks.request.mockResolvedValue({ ...run(), conclusion: "failure" })
        await expect(dispatchAndWatch(operation(), new AbortController().signal)).rejects.toThrow("sem sucesso")
        await expect(dispatchAndWatch(operation(), new AbortController().signal, true)).resolves.toMatchObject({
            conclusion: "failure",
        })
        expect(store.op.docs[0].projectId).toBe(repoId)
    })
})
