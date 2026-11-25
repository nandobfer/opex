import { beforeEach, describe, expect, it, vi } from "vitest"
import { emptyPersonality } from "@/features/secretary-agent/personality"

const mocks = vi.hoisted(() => ({
    current: { versionId: "v2" as string | null },
    versions: [] as Record<string, unknown>[],
}))

vi.mock("@/lib/db", () => ({ AcaoAuditoria: { ATUALIZAR: "ATUALIZAR" }, recordAudit: vi.fn() }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: vi.fn() }))
vi.mock("@/features/secretary-agent/server/models", () => ({
    secretaryDb: vi.fn(),
    SecretaryPersonality: {
        findById: () => ({ lean: async () => (mocks.current.versionId ? { versionId: mocks.current.versionId, snapshot: { base: emptyPersonality(), variants: [] } } : null) }),
        updateOne: async (filter: { versionId: unknown }, update: { $set: { versionId: string } }) => {
            if (filter.versionId !== mocks.current.versionId) return { matchedCount: 0, upsertedCount: 0 }
            mocks.current.versionId = update.$set.versionId
            return { matchedCount: 1, upsertedCount: 0 }
        },
    },
    SecretaryVersion: { create: async (row: Record<string, unknown>) => mocks.versions.push(row), deleteOne: vi.fn() },
}))

import { saveBasePersonality } from "@/features/secretary-agent/server/personality"

const blocks = [{ key: "tom", title: "Tom e formalidade", content: "Informal" }]

beforeEach(() => {
    mocks.current.versionId = "v2"
    mocks.versions = []
})

describe("saveBasePersonality", () => {
    it("grava quando a edição partiu da versão atual", async () => {
        const id = await saveBasePersonality({ blocks, expectedVersionId: "v2" }, "local")
        expect(mocks.current.versionId).toBe(id)
        expect(mocks.versions).toHaveLength(1)
    })

    it("recusa (409) a edição feita sobre uma versão antiga, sem sobrescrever a análise", async () => {
        await expect(saveBasePersonality({ blocks, expectedVersionId: "v1" }, "local")).rejects.toMatchObject({ status: 409, code: "SECRETARY_PERSONALITY_CHANGED" })
        expect(mocks.current.versionId).toBe("v2")
        expect(mocks.versions).toHaveLength(0)
    })
})
