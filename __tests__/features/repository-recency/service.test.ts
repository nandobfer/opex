import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Histórico de repositórios usados recentemente (serviço). O histórico é por ator, guardado no
 * servidor, e nunca concede acesso: ids fora do conjunto permitido no contexto são ignorados na
 * leitura e recusados no registro.
 */

const mocks = vi.hoisted(() => ({
    publish: vi.fn(),
    selections: null as unknown,
}))

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: mocks.publish }))
vi.mock("@/lib/db/models/RepositorySelection", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.selections = memoryModel()
    return { RepositorySelection: mocks.selections }
})

import { getRepoRecents, listRepoRecents, recordRepoRecent } from "@/features/repository-recency/server/service"
import { REPO_RECENTS_UPDATED_EVENT } from "@/features/repository-recency/constants"
import type { MemoryModel } from "../../helpers/memory-model"

const selections = () => mocks.selections as MemoryModel
const allowed = (...ids: string[]) => new Set(ids)

const p1 = "a".repeat(24)
const p2 = "b".repeat(24)
const p3 = "c".repeat(24)

const seed = (actorId: string, projectId: string, at: string) =>
    selections().create({ actorId, projectId, lastSelectedAt: new Date(at) })

beforeEach(() => {
    vi.clearAllMocks()
    selections().docs.length = 0
})

describe("listRepoRecents", () => {
    it("devolve os ids do mais recente para o mais antigo", async () => {
        await seed("local", p1, "2026-01-01T00:00:00Z")
        await seed("local", p2, "2026-01-02T00:00:00Z")
        expect(await listRepoRecents("local", allowed(p1, p2))).toEqual([p2, p1])
    })

    it("filtra pelo contexto permitido e não mistura atores", async () => {
        await seed("local", p1, "2026-01-01T00:00:00Z")
        await seed("local", p2, "2026-01-02T00:00:00Z")
        await seed("outro", p3, "2026-01-03T00:00:00Z")

        expect(await listRepoRecents("local", allowed(p2))).toEqual([p2])
        expect(await listRepoRecents("local", allowed(p1, p2))).toEqual([p2, p1])
        expect(await listRepoRecents("outro", allowed(p3))).toEqual([p3])
    })

    it("sem contexto permitido, devolve lista vazia", async () => {
        await seed("local", p1, "2026-01-01T00:00:00Z")
        expect(await listRepoRecents("local", allowed())).toEqual([])
    })
})

describe("recordRepoRecent", () => {
    it("recusa repositório fora do contexto permitido", async () => {
        await expect(recordRepoRecent("local", p1, allowed(p2))).rejects.toMatchObject({ code: "PROJECT_NOT_ALLOWED" })
        expect(selections().docs).toHaveLength(0)
        expect(mocks.publish).not.toHaveBeenCalled()
    })

    it("move o repositório escolhido para o topo sem duplicar o registro", async () => {
        await seed("local", p2, "2020-01-01T00:00:00Z")
        await seed("local", p1, "2021-01-01T00:00:00Z")
        expect(await listRepoRecents("local", allowed(p1, p2))).toEqual([p1, p2])

        const updated = await recordRepoRecent("local", p2, allowed(p1, p2))
        expect(updated.projectIds).toEqual([p2, p1])
        expect(selections().docs).toHaveLength(2)
    })

    it("publica no canal privado do ator após registrar", async () => {
        const result = await recordRepoRecent("local", p1, allowed(p1))
        expect(result).toEqual({ projectIds: [p1], channel: "private-repo-recents-local" })
        expect(mocks.publish).toHaveBeenCalledWith(["private-repo-recents-local"], REPO_RECENTS_UPDATED_EVENT, { projectId: p1 })
    })
})

describe("getRepoRecents", () => {
    it("devolve o histórico com o canal privado do ator", async () => {
        await seed("u1", p1, "2026-01-01T00:00:00Z")
        expect(await getRepoRecents("u1", allowed(p1))).toEqual({ projectIds: [p1], channel: "private-repo-recents-u1" })
    })
})
