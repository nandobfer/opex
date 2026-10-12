import { describe, expect, it } from "vitest"
import { groupCostByProject, type CostTaskInput } from "@/features/orcamentos/server/portal-finance"

const day = (iso: string) => new Date(iso).getTime()

const tasks: CostTaskInput[] = [
    { id: "1", code: "APP-1", title: "A", projectId: "p1", repo: "acme/app", clientHours: 20, costBrl: 2000, completedAt: day("2026-03-10T10:00:00Z") },
    { id: "2", code: "APP-2", title: "B", projectId: "p2", repo: "acme/site", clientHours: 5, costBrl: 250.5, completedAt: day("2026-03-11T10:00:00Z") },
    { id: "3", code: "APP-3", title: "C", projectId: "p1", repo: "acme/app", clientHours: 10, costBrl: 1000.25, completedAt: day("2026-03-12T10:00:00Z") },
    { id: "4", code: "APP-4", title: "D", projectId: null, repo: null, clientHours: 2, costBrl: 100, completedAt: day("2026-03-13T10:00:00Z") },
    { id: "5", code: "APP-5", title: "E", projectId: "p3", repo: null, clientHours: 1, costBrl: 50, completedAt: day("2026-03-14T10:00:00Z") },
]

const projects = new Map([
    ["p1", { id: "p1", repo: "acme/app" }],
    ["p2", { id: "p2", repo: "acme/site" }],
])

describe("custo do cliente agrupado por repositório", () => {
    it("agrupa, soma e ordena os grupos por custo (desc)", () => {
        const result = groupCostByProject(tasks, projects, { from: null, to: null })
        expect(result.groups.map((group) => group.repo)).toEqual(["acme/app", "acme/site", "Sem repositório", "Repositório removido"])
        expect(result.groups[0]).toMatchObject({ projectId: "p1", taskCount: 2, totalClientHours: 30, totalCostBrl: 3000.25 })
        expect(result.totals).toEqual({ taskCount: 5, totalClientHours: 38, totalCostBrl: 3400.75 })
    })

    it("dentro do grupo, as tarefas ficam por conclusão (desc)", () => {
        const result = groupCostByProject(tasks, projects, { from: null, to: null })
        expect(result.groups[0]!.tasks.map((task) => task.code)).toEqual(["APP-3", "APP-1"])
    })

    it("rotula repositório removido e tarefa sem repositório", () => {
        const result = groupCostByProject(tasks, projects, { from: null, to: null })
        expect(result.groups.find((group) => group.projectId === null)!.repo).toBe("Sem repositório")
        expect(result.groups.find((group) => group.projectId === "p3")!.repo).toBe("Repositório removido")
        expect(result.groups.find((group) => group.projectId === "p3")!.tasks[0]!.repo).toBe("Repositório removido")
    })

    it("sem tarefas, devolve totais zerados", () => {
        const result = groupCostByProject([], projects, { from: "2026-03-01T00:00:00Z", to: "2026-03-31T23:59:59Z" })
        expect(result.groups).toEqual([])
        expect(result.totals).toEqual({ taskCount: 0, totalClientHours: 0, totalCostBrl: 0 })
        expect(result.from).toBe("2026-03-01T00:00:00Z")
    })
})
