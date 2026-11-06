import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    runs: [] as unknown[],
    events: [] as unknown[],
    tasks: new Map<string, { clientId: string | null; projectId: string | null; archived: boolean; code: string; title: string }>(),
}))

/** Consulta encadeada do Mongoose (`sort/skip/limit/select/lean`) que resolve com os documentos. */
const chain = (docs: () => unknown[]) => {
    const query = { sort: () => query, skip: () => query, limit: () => query, select: () => query, lean: async () => docs() }
    return query
}

vi.mock("@/lib/db/models/AgentMetrics", () => ({
    AgentRun: { find: () => chain(() => mocks.runs), countDocuments: async () => mocks.runs.length },
    AgentMetricEvent: { find: (filter: { type?: unknown }) => chain(() => (filter.type ? mocks.events : [])) },
    AgentConversation: { find: () => chain(() => []) },
}))
vi.mock("@/lib/db/models/Agentic", () => ({ AgenticWorkbench: { find: () => chain(() => []) } }))
vi.mock("@/lib/db/models/Refinement", () => ({ TaskRefinement: { find: () => chain(() => []) } }))
vi.mock("@/features/agent-metrics/server/context", () => ({
    createMetricsContext: async () => ({ range: { from: new Date(0), to: new Date() } }),
    loadTasks: async () => mocks.tasks,
    matchesFilters: () => true,
    mongoFilters: () => ({}),
}))
vi.mock("@/features/agent-metrics/server/exclusions", () => ({ COUNTED_RUN: {} }))

import { getAgentHistory } from "@/features/agent-metrics/server/history"

const ID = "a".repeat(24)
const query = { page: 1, limit: 20 } as Parameters<typeof getAgentHistory>[1]
const run = (patch: Record<string, unknown>) => ({ dedupKey: "k1", finishedAt: new Date(), kind: "estimate-hours", ok: true, title: "Rodapé", taskId: ID, taskCode: "OPE-1", ...patch })

beforeEach(() => {
    mocks.runs = []
    mocks.events = []
    mocks.tasks = new Map()
})

describe("histórico dos agentes — link da tarefa pelo código (OPE-146)", () => {
    it("execução com código aponta para /tarefas/<código em minúsculas>", async () => {
        mocks.runs = [run({})]
        const page = await getAgentHistory("orcamentista", query)
        expect(page.items[0]?.href).toBe("/tarefas/ope-1")
    })

    it("execução sem código gravado cai no id (a página redireciona para o código)", async () => {
        mocks.runs = [run({ taskCode: null })]
        const page = await getAgentHistory("orcamentista", query)
        expect(page.items[0]?.href).toBe(`/tarefas/${ID}`)
    })

    it("execução sem tarefa não tem link", async () => {
        mocks.runs = [run({ taskId: null, taskCode: null })]
        const page = await getAgentHistory("orcamentista", query)
        expect(page.items[0]?.href).toBeNull()
    })

    it("refinamento usa o código da tarefa atual", async () => {
        mocks.events = [{ _id: "e1", at: new Date(), taskId: ID, refId: null, data: null }]
        mocks.tasks = new Map([[ID, { clientId: null, projectId: null, archived: false, code: "OPE-7", title: "Spec" }]])
        const page = await getAgentHistory("refinador", query)
        expect(page.items[0]?.href).toBe("/tarefas/ope-7")
    })
})
