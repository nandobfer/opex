import { beforeEach, describe, expect, it, vi } from "vitest"
import { DomainError } from "@/lib/api/route"

const mocks = vi.hoisted(() => {
    const rows = new Map<string, Record<string, unknown>>()
    return {
        rows,
        create: vi.fn(),
        update: vi.fn(),
        model: {
            updateOne: async (filter: { _id: string }, update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown>; $inc?: Record<string, number> }) => {
                const current = rows.get(filter._id)
                const next = { _id: filter._id, ...(current ?? update.$setOnInsert ?? {}), ...(update.$set ?? {}) }
                for (const [key, value] of Object.entries(update.$inc ?? {})) (next as Record<string, unknown>)[key] = Number((next as Record<string, unknown>)[key] ?? 0) + value
                rows.set(filter._id, next)
            },
            find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [...rows.values()] }) }) }),
            deleteOne: async (filter: { _id: string }) => rows.delete(filter._id),
            countDocuments: async () => rows.size,
        },
    }
})

vi.mock("mongoose", async (importOriginal) => {
    const actual = (await importOriginal()) as { models: Record<string, unknown>; default: Record<string, unknown> }
    const models = { ...actual.models, EngramindPendingWrite: mocks.model }
    return { ...actual, models, default: { ...actual.default, models } }
})
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/features/ai/server/agent-memory-service", () => ({ createAgentMemory: mocks.create, updateAgentMemory: mocks.update }))

import { enqueuePendingWrite, flushPendingWrites } from "@/features/engramind/server/pending-writes"
import { withPendingQueue } from "@/features/secretary-agent/server/memory-queue"

const offline = () => new DomainError(503, "fora", "ENGRAMIND_UNREACHABLE")

beforeEach(() => {
    vi.clearAllMocks()
    mocks.rows.clear()
})

describe("fila de pendências do Engramind", () => {
    it("com o Engramind fora, a gravação vai para a fila e devolve o id pendente", async () => {
        const result = await withPendingQueue({ list: "secretary-conversation", conversationId: "5531999999999", actorId: "local", write: { op: "create", texto: "Ana é a vizinha" } }, async () => {
            throw offline()
        })
        expect(result).toMatchObject({ pendente: true, id: expect.stringMatching(/^pendente:agentes\/secretario\/conversas\/5531999999999:/) })
        expect(mocks.rows.size).toBe(1)
    })

    it("a mesma memória não entra duas vezes", async () => {
        const input = { channel: "agentes/secretario/global", list: "secretary-global" as const, options: {}, actorId: "local", write: { op: "create" as const, texto: "x" } }
        await enqueuePendingWrite(input)
        await enqueuePendingWrite(input)
        expect(mocks.rows.size).toBe(1)
    })

    it("reprocessa e para enquanto o Engramind segue fora", async () => {
        await enqueuePendingWrite({ channel: "c", list: "secretary-global", options: {}, actorId: "local", write: { op: "create", texto: "a" } })
        mocks.create.mockRejectedValueOnce(offline())
        expect(await flushPendingWrites()).toEqual({ done: 0, failed: 0, remaining: 1 })
        expect(await flushPendingWrites()).toEqual({ done: 1, failed: 0, remaining: 0 })
        expect(mocks.create).toHaveBeenCalledWith("secretary-global", "a", "local", {})
    })

    it("reprocessa na ordem o novo texto e a desativação da mesma memória", async () => {
        const input = { channel: "c", list: "secretary-global" as const, options: {}, actorId: "local" }
        const texto = { texto: "novo texto" }
        const ativa = { ativa: false }
        for (const patch of [texto, ativa]) await enqueuePendingWrite({ ...input, write: { op: "update", memoryId: "m1", patch } })
        expect(await flushPendingWrites()).toEqual({ done: 2, failed: 0, remaining: 0 })
        expect(mocks.update.mock.calls).toEqual([texto, ativa].map((patch) => ["secretary-global", "m1", patch, "local", {}]))
    })

    it("erro que não é de disponibilidade não entra na fila", async () => {
        await expect(withPendingQueue({ list: "secretary-global", conversationId: null, actorId: "local", write: { op: "create", texto: "a" } }, async () => {
            throw new DomainError(409, "duplicada", "ENGRAMIND_MEMORY_DUPLICATE")
        })).rejects.toThrow("duplicada")
        expect(mocks.rows.size).toBe(0)
    })
})
