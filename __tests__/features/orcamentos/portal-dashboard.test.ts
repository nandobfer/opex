import { describe, expect, it } from "vitest"
import { aggregateClienteTags, NO_TAG_LABEL, summarizeClienteFinance } from "@/features/orcamentos/server/portal-aggregate"
import type { ClienteFinanceDto } from "@/features/orcamentos/types"

/**
 * Agregações puras do dashboard do portal: contagem por **tag** (no lugar do tipo de tarefa do dono)
 * e o resumo financeiro (custo/horas por repositório + evolução mensal).
 */

describe("tags do dashboard do cliente", () => {
    it("conta cada tag uma vez por tarefa, agrupa as sem tag e mantém o id fora da taxonomia", () => {
        const labels = new Map([
            ["ia", "IA"],
            ["horas", "Horas"],
        ])

        const slices = aggregateClienteTags([{ tags: ["ia", "horas"] }, { tags: ["ia", "ia"] }, { tags: [] }, {}, { tags: ["zeta"] }], labels)

        expect(slices).toEqual([
            { tag: "ia", label: "IA", count: 2 },
            { tag: null, label: NO_TAG_LABEL, count: 2 },
            { tag: "horas", label: "Horas", count: 1 },
            { tag: "zeta", label: "zeta", count: 1 },
        ])
    })

    it("sem tarefas, não há barra alguma", () => {
        expect(aggregateClienteTags([], new Map())).toEqual([])
    })
})

const from = "2026-01-01T00:00:00.000Z"
const to = "2026-03-31T23:59:59.999Z"

const finance = (): ClienteFinanceDto => ({
    from,
    to,
    groups: [
        {
            projectId: "p1",
            repo: "acme/app",
            taskCount: 2,
            serviceCount: 1,
            totalClientHours: 35,
            totalCostBrl: 3500.25,
            tasks: [
                { id: "1", kind: "task", code: "A-1", title: "A", repo: "acme/app", projectId: "p1", clientHours: 20, costBrl: 2000, completedAt: "2026-01-10T10:00:00.000Z" },
                { id: "2", kind: "task", code: "A-2", title: "B", repo: "acme/app", projectId: "p1", clientHours: 10, costBrl: 1000.25, completedAt: "2026-03-12T10:00:00.000Z" },
                { id: "4", kind: "service", code: "SRV-1", title: "Serviço", repo: "acme/app", projectId: "p1", clientHours: 5, costBrl: 500, completedAt: "2026-03-15T00:00:00.000Z" },
            ],
        },
        {
            projectId: null,
            repo: "Sem repositório",
            taskCount: 1,
            serviceCount: 0,
            totalClientHours: 2,
            totalCostBrl: 100,
            tasks: [{ id: "3", kind: "task", code: "A-3", title: "C", repo: null, projectId: null, clientHours: 2, costBrl: 100, completedAt: "2026-02-05T10:00:00.000Z" }],
        },
    ],
    totals: { taskCount: 3, serviceCount: 1, totalClientHours: 37, totalCostBrl: 3600.25 },
})

describe("resumo financeiro do dashboard do cliente", () => {
    it("resume totais, custo/horas por repositório e a evolução mensal", () => {
        const summary = summarizeClienteFinance(finance(), new Date(from).getTime(), new Date(to).getTime(), "UTC")

        expect(summary.totals).toEqual({ totalCostBrl: 3600.25, totalClientHours: 37, taskCount: 3, serviceCount: 1 })
        expect(summary.byProject).toEqual([
            { projectId: "p1", repo: "acme/app", costBrl: 3500.25, clientHours: 35, taskCount: 2, serviceCount: 1 },
            { projectId: null, repo: "Sem repositório", costBrl: 100, clientHours: 2, taskCount: 1, serviceCount: 0 },
        ])
        expect(summary.timeline).toEqual([
            { bucket: "2026-01", costBrl: 2000 },
            { bucket: "2026-02", costBrl: 100 },
            { bucket: "2026-03", costBrl: 1500.25 },
        ])
    })

    it("ignora a conclusão fora do período (só os meses do intervalo entram)", () => {
        const summary = summarizeClienteFinance(finance(), new Date(from).getTime(), new Date("2026-02-28T23:59:59.999Z").getTime(), "UTC")

        expect(summary.timeline).toEqual([
            { bucket: "2026-01", costBrl: 2000 },
            { bucket: "2026-02", costBrl: 100 },
        ])
    })

    it("sem grupos, devolve totais zerados e a série do período em zero", () => {
        const summary = summarizeClienteFinance({ from, to, groups: [], totals: { taskCount: 0, serviceCount: 0, totalClientHours: 0, totalCostBrl: 0 } }, new Date(from).getTime(), new Date(to).getTime(), "UTC")

        expect(summary.totals).toEqual({ totalCostBrl: 0, totalClientHours: 0, taskCount: 0, serviceCount: 0 })
        expect(summary.byProject).toEqual([])
        expect(summary.timeline.map((point) => point.costBrl)).toEqual([0, 0, 0])
    })
})
