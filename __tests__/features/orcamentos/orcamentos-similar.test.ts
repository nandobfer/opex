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

const doc = (id: string, over: Record<string, unknown> = {}) => ({ _id: id, code: `OPX-${id}`, title: `T${id}`, taskType: "feature", tags: [], estimate: { hours: 5 }, ...over })

beforeEach(() => {
    vi.clearAllMocks()
    mocks.tagDocs = []
    mocks.typeDocs = []
    mocks.projectDocs = []
    mocks.aggregate.mockResolvedValue([])
})

describe("findSimilarTasks", () => {
    it("usa as tarefas com tag em comum (primário)", async () => {
        mocks.tagDocs = [doc("a"), doc("b")]
        const result = await findSimilarTasks({ tags: ["api"], taskType: "feature", projectId: "p", limit: 5 })
        expect(result.map((task) => task.code)).toEqual(["OPX-a", "OPX-b"])
        expect(result.every((task) => task.match === "tag")).toBe(true)
    })

    it("sem tags em comum, completa por tipo (fallback)", async () => {
        mocks.typeDocs = [doc("c")]
        const result = await findSimilarTasks({ tags: ["api"], taskType: "feature", projectId: "p", limit: 5 })
        expect(result.map((task) => task.code)).toEqual(["OPX-c"])
        expect(result[0]?.match).toBe("type")
    })

    it("horas apontadas (TimeLog) prevalecem sobre a estimativa anterior", async () => {
        mocks.tagDocs = [doc("a", { estimate: { hours: 5 } })]
        mocks.aggregate.mockResolvedValue([{ _id: "a", minutes: 180 }])
        const [task] = await findSimilarTasks({ tags: ["api"], taskType: null, projectId: "", limit: 5 })
        expect(task?.hours).toBe(3)
    })

    it("sem candidatos, devolve vazio", async () => {
        expect(await findSimilarTasks({ tags: [], taskType: null, projectId: "", limit: 5 })).toEqual([])
    })
})
