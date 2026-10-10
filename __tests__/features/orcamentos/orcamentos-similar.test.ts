import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    tagDocs: [] as Array<Record<string, unknown>>,
    typeDocs: [] as Array<Record<string, unknown>>,
    projectDocs: [] as Array<Record<string, unknown>>,
    aggregate: vi.fn(async () => [] as Array<Record<string, unknown>>),
}))

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/lib/db/models/DevTask", () => ({
    DevTask: {
        find: (filter: Record<string, unknown>) => ({
            sort: () => ({
                limit: () => ({
                    select: () => ({ lean: async () => ("tags" in filter ? mocks.tagDocs : "taskType" in filter ? mocks.typeDocs : mocks.projectDocs) }),
                }),
            }),
        }),
    },
}))
vi.mock("@/lib/db/models/TimeLog", () => ({ TimeLog: { aggregate: mocks.aggregate } }))

import { findSimilarTasks } from "@/features/orcamentos/server/similar"

const doc = (id: string, over: Record<string, unknown> = {}) => ({ _id: id, code: `OPX-${id}`, title: `T${id}`, taskType: "feature", tags: [], ...over })

beforeEach(() => {
    vi.clearAllMocks()
    mocks.tagDocs = []
    mocks.typeDocs = []
    mocks.projectDocs = []
    mocks.aggregate.mockResolvedValue([])
})

describe("findSimilarTasks", () => {
    it("usa as tarefas com tag em comum e as horas reais apontadas", async () => {
        mocks.tagDocs = [doc("a"), doc("b")]
        mocks.aggregate.mockResolvedValue([{ _id: "a", minutes: 30 }, { _id: "b", minutes: 12 }])
        const result = await findSimilarTasks({ tags: ["api"], taskType: "feature", projectId: "p", limit: 5 })
        expect(result.map((task) => task.code)).toEqual(["OPX-a", "OPX-b"])
        expect(result.map((task) => task.hours)).toEqual([0.5, 0.2])
        expect(result.every((task) => task.match === "tag")).toBe(true)
    })

    it("descarta tarefas sem horas apontadas (não usa a estimativa anterior da IA)", async () => {
        mocks.tagDocs = [doc("a"), doc("b")]
        mocks.aggregate.mockResolvedValue([{ _id: "a", minutes: 18 }])
        const result = await findSimilarTasks({ tags: ["api"], taskType: null, projectId: "", limit: 5 })
        expect(result.map((task) => task.code)).toEqual(["OPX-a"])
    })

    it("sem tags em comum, completa por tipo (fallback)", async () => {
        mocks.typeDocs = [doc("c")]
        mocks.aggregate.mockResolvedValue([{ _id: "c", minutes: 30 }])
        const result = await findSimilarTasks({ tags: ["api"], taskType: "feature", projectId: "p", limit: 5 })
        expect(result.map((task) => task.code)).toEqual(["OPX-c"])
        expect(result[0]?.match).toBe("type")
    })

    it("sem nenhuma tarefa com horas apontadas, devolve vazio", async () => {
        mocks.tagDocs = [doc("a")]
        expect(await findSimilarTasks({ tags: ["api"], taskType: null, projectId: "", limit: 5 })).toEqual([])
    })
})
