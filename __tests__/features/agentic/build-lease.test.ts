import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ claim: vi.fn(), update: vi.fn() }))
vi.mock("@/lib/db/models/BuildQueueLease", () => ({
    BuildQueueLease: { findOneAndUpdate: mocks.claim, updateOne: mocks.update },
}))
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }))
import { withBuildQueueLease } from "@/features/agentic/server/build-lease"
beforeEach(() => {
    vi.clearAllMocks()
    mocks.update.mockResolvedValue({ matchedCount: 1 })
})
describe("lease Mongo do despachante global", () => {
    it("despachante concorrente não entra e a liberação é condicionada ao holder", async () => {
        let occupied = false
        mocks.claim.mockImplementation((_filter, update) => ({
            lean: async () => {
                if (occupied) throw Object.assign(new Error("duplicate key"), { code: 11000 })
                occupied = true
                return { holder: update.$set.holder }
            },
        }))
        let release: () => void = () => undefined
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        const first = vi.fn(async () => gate),
            second = vi.fn()
        const pending = withBuildQueueLease(first)
        await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1))
        await withBuildQueueLease(second)
        expect(second).not.toHaveBeenCalled()
        release()
        await pending
        expect(mocks.update).toHaveBeenCalledWith(
            { _id: "global", holder: expect.any(String) },
            { $set: { expiresAt: new Date(0) } },
        )
    })
    it("falha do participante sempre libera lease", async () => {
        mocks.claim.mockImplementation((_filter, update) => ({ lean: async () => ({ holder: update.$set.holder }) }))
        await expect(
            withBuildQueueLease(async () => {
                throw new Error("falha")
            }),
        ).rejects.toThrow("falha")
        expect(mocks.update).toHaveBeenCalledTimes(1)
    })
})
