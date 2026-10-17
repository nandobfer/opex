import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ actor: vi.fn(), operate: vi.fn() }))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logApiError: vi.fn() }))
vi.mock("@/features/environments/server/events", () => ({ publishEnvironment: vi.fn() }))
vi.mock("@/features/environments/server/access", async (original) => ({
    ...(await original<typeof import("@/features/environments/server/access")>()),
    environmentActor: mocks.actor,
}))
vi.mock("@/features/environments/server/operations", () => ({ requestOperation: mocks.operate }))
vi.mock("@/features/environments/server/logs", () => ({ logViewer: vi.fn(), logsHistory: vi.fn() }))
vi.mock("@/features/environments/server/github", () => ({ ciCd: vi.fn() }))
vi.mock("@/lib/db/models/Project", async () => ({ Project: (await import("./fixtures")).store.project }))
vi.mock("@/lib/db/models/Environment", async () => ({ Environment: (await import("./fixtures")).store.env }))
vi.mock("@/lib/db/models/EnvironmentRepoConfig", async () => ({
    EnvironmentRepoConfig: (await import("./fixtures")).store.repo,
}))
vi.mock("@/lib/db/models/EnvironmentOperation", async () => ({
    EnvironmentOperation: (await import("./fixtures")).store.op,
}))
vi.mock("@/lib/db/models/EnvironmentImage", async () => ({
    EnvironmentImage: (await import("./fixtures")).store.image,
}))
import { environmentRoute, rootRoute } from "@/features/environments/server/routes"
import { DomainError } from "@/lib/api/route"
import { resetStore, repoId, envId } from "./fixtures"
const owner = { userId: "local", clientId: null, projectIds: null, canEdit: true, owner: true }
const ctx = { params: Promise.resolve({ path: [repoId, "environments", envId, "operations"] }) }
const req = (body: unknown) =>
    new NextRequest("http://localhost/api/cliente/ambientes", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    })
beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    mocks.actor.mockResolvedValue(owner)
    mocks.operate.mockResolvedValue({ id: "operation" })
})
describe("APIs do dono e portal", () => {
    it("entrada do portal revalida tipo de sessão e responde no contrato padrão", async () => {
        const response = await rootRoute(true)(req({}), { params: Promise.resolve({}) })
        expect(mocks.actor).toHaveBeenCalledWith(expect.any(NextRequest), true)
        expect(await response.json()).toEqual({ success: true, data: [{ id: repoId, repo: "org/app", name: "App" }] })
    })
    it("não aceita operação sem confirmação nem campos de permissão injetados", async () => {
        const handler = environmentRoute(true)
        const base = {
            kind: "publish",
            method: "host",
            confirmation: true,
            riskConfirmed: false,
            expectedRevision: 0,
            requestId: crypto.randomUUID(),
        }
        expect((await handler(req({ ...base, confirmation: false }), ctx)).status).toBe(400)
        expect((await handler(req({ ...base, owner: true }), ctx)).status).toBe(400)
        expect(mocks.operate).not.toHaveBeenCalled()
        expect((await handler(req(base), ctx)).status).toBe(202)
        expect(mocks.operate).toHaveBeenCalledWith(owner, repoId, envId, base)
    })
    it("sessão revogada interrompe antes de executar qualquer ação", async () => {
        mocks.actor.mockRejectedValue(new DomainError(401, "Sessão inválida"))
        const response = await environmentRoute(true)(req({}), ctx)
        expect(response.status).toBe(401)
        expect(mocks.operate).not.toHaveBeenCalled()
    })
})
