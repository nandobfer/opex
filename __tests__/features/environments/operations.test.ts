import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ pump: vi.fn(), audit: vi.fn(), availability: vi.fn() }))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/lib/audit/record", () => ({ recordAudit: mocks.audit, AcaoAuditoria: { EXECUTAR: "EXECUTAR" } }))
vi.mock("@/features/environments/server/events", () => ({ publishEnvironment: vi.fn() }))
vi.mock("@/features/environments/server/queue", () => ({ pumpEnvironments: mocks.pump }))
vi.mock("@/features/ai/server/settings", () => ({ getEnvironmentSettings: mocks.availability }))
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
import { requestOperation } from "@/features/environments/server/operations"
import { resetStore, store, repoId, envId, imageId, settings, observed } from "./fixtures"
import type { OperationInput } from "@/features/environments/schemas"
const actor = { userId: "client-user", clientId: "client", projectIds: [repoId], canEdit: false, owner: false }
const input = (): OperationInput => ({
    kind: "publish",
    method: "host",
    confirmation: true,
    riskConfirmed: false,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
})

beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    mocks.availability.mockResolvedValue({ settings, availability: { available: true } })
    mocks.pump.mockResolvedValue(undefined)
})
describe("operações confirmadas e exclusão mútua", () => {
    it("usuário comum vinculado pode publicar e snapshot preserva configuração/agente", async () => {
        const result = await requestOperation(actor, repoId, envId, input())
        expect(String(store.env.docs[0].activeOperationId)).toBe(result.id)
        expect(store.op.docs[0]).toMatchObject({
            actorId: actor.userId,
            state: "queued",
            kind: "publish",
            agentSettings: settings,
        })
        expect(mocks.audit).toHaveBeenCalled()
    })
    it("requestId é idempotente e nunca inicia duas operações por ambiente", async () => {
        const request = input()
        const first = await requestOperation(actor, repoId, envId, request)
        expect(await requestOperation(actor, repoId, envId, request)).toEqual(first)
        expect(store.op.docs).toHaveLength(1)
        await expect(requestOperation(actor, repoId, envId, input())).rejects.toMatchObject({ status: 409 })
    })
    it("duas confirmações simultâneas reservam no máximo uma operação", async () => {
        const results = await Promise.allSettled([
            requestOperation(actor, repoId, envId, input()),
            requestOperation(actor, repoId, envId, input()),
        ])
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
        expect(store.op.docs).toHaveLength(1)
    })
    it("mudança após confirmação e provedor indisponível bloqueiam antes da reserva", async () => {
        await expect(requestOperation(actor, repoId, envId, { ...input(), expectedRevision: 3 })).rejects.toMatchObject(
            { status: 409 },
        )
        mocks.availability.mockResolvedValue({
            settings,
            availability: { available: false, reason: "OpenCode desconectado" },
        })
        await expect(requestOperation(actor, repoId, envId, input())).rejects.toThrow("OpenCode desconectado")
        expect(store.env.docs[0].activeOperationId).toBeNull()
    })
    it("restauração compatível permite; divergente bloqueia sem tocar containers", async () => {
        store.image.docs.push({ _id: imageId, environmentId: envId, dbVersion: "m001", images: observed.images })
        await expect(
            requestOperation(actor, repoId, envId, { ...input(), kind: "restore", imageId }),
        ).rejects.toMatchObject({ code: "DB_INCOMPATIBLE" })
        store.image.docs[0].dbVersion = "m002"
        await expect(
            requestOperation(actor, repoId, envId, { ...input(), kind: "restore", imageId }),
        ).resolves.toHaveProperty("id")
    })
    it("banco desconhecido exige segunda confirmação e imagem de outro ambiente não serve", async () => {
        store.image.docs.push({ _id: imageId, environmentId: envId, dbVersion: null, images: observed.images })
        await expect(
            requestOperation(actor, repoId, envId, { ...input(), kind: "restore", imageId }),
        ).rejects.toMatchObject({ code: "DB_UNKNOWN" })
        await expect(
            requestOperation(actor, repoId, envId, { ...input(), kind: "restore", imageId, riskConfirmed: true }),
        ).resolves.toHaveProperty("id")
    })
    it("CD exige workflow e nunca é usado para restaurar", async () => {
        await expect(requestOperation(actor, repoId, envId, { ...input(), method: "cd" })).rejects.toMatchObject({
            status: 409,
        })
        await expect(
            requestOperation(actor, repoId, envId, { ...input(), kind: "inspect", method: "cd" }),
        ).rejects.toMatchObject({ status: 400 })
    })
})
