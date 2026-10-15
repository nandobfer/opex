import { describe, expect, it } from "vitest"
import {
    aggregateFinanceClients,
    aggregateTasks,
    aggregateTimeLogs,
    aggregateWorkbenches,
    bucketKeyFor,
    bucketKeys,
    bucketMode,
    buildFinanceTimeline,
    buildTaskTimeline,
    dayKey,
    monthKey,
    weekKey,
    type ColumnInfo,
    type ProjectInfo,
    type TaskAggInput,
} from "@/features/dashboard/logic"

const TZ = "America/Sao_Paulo"
const columns: ColumnInfo[] = [
    { key: "todo", name: "A Fazer", color: "zinc" },
    { key: "doing", name: "Em Andamento", color: "sky" },
    { key: "done", name: "Concluído", color: "emerald" },
]
const projects = new Map<string, ProjectInfo>([["p1", { id: "p1", name: "Portal", sigla: "POR" }]])

const task = (overrides: Partial<TaskAggInput> = {}): TaskAggInput => ({
    id: "t1",
    columnId: "todo",
    taskType: "feature",
    projectId: "p1",
    createdAt: Date.UTC(2026, 9, 5),
    completedAt: null,
    ...overrides,
})

describe("buckets e fusos", () => {
    it("resolve o dia no fuso informado (virada de dia)", () => {
        const ms = Date.UTC(2026, 9, 5, 2, 0, 0)
        expect(dayKey(ms, "UTC")).toBe("2026-10-05")
        expect(dayKey(ms, TZ)).toBe("2026-10-04")
    })

    it("semana começa na segunda-feira", () => {
        expect(weekKey(Date.UTC(2026, 9, 5), "UTC")).toBe("2026-10-05")
        expect(weekKey(Date.UTC(2026, 9, 7), "UTC")).toBe("2026-10-05")
        expect(weekKey(Date.UTC(2026, 9, 11), "UTC")).toBe("2026-10-05")
    })

    it("mês no formato YYYY-MM", () => {
        expect(monthKey(Date.UTC(2026, 9, 5), "UTC")).toBe("2026-10")
    })

    it("modo do bucket: ≤ 31 dias é diário, acima é semanal", () => {
        expect(bucketMode(Date.UTC(2026, 8, 1), Date.UTC(2026, 9, 1))).toBe("day")
        expect(bucketMode(Date.UTC(2026, 6, 1), Date.UTC(2026, 9, 1))).toBe("week")
    })

    it("gera as chaves dos buckets cobrindo o intervalo", () => {
        expect(bucketKeys("day", Date.UTC(2026, 9, 5), Date.UTC(2026, 9, 7), "UTC")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"])
        expect(bucketKeys("week", Date.UTC(2026, 9, 5), Date.UTC(2026, 9, 14), "UTC")).toEqual(["2026-10-05", "2026-10-12"])
        expect(bucketKeys("month", Date.UTC(2025, 10, 15), Date.UTC(2026, 1, 10), "UTC")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"])
    })

    it("intervalo invertido não gera buckets", () => {
        expect(bucketKeys("day", Date.UTC(2026, 9, 7), Date.UTC(2026, 9, 5), "UTC")).toEqual([])
    })

    it("bucketKeyFor escolhe o formato pelo modo", () => {
        const ms = Date.UTC(2026, 9, 7)
        expect(bucketKeyFor(ms, "day", "UTC")).toBe("2026-10-07")
        expect(bucketKeyFor(ms, "week", "UTC")).toBe("2026-10-05")
        expect(bucketKeyFor(ms, "month", "UTC")).toBe("2026-10")
    })
})

describe("aggregateTasks", () => {
    it("conta por coluna, tipo e projeto e separa as em andamento", () => {
        const tasks = [
            task({ id: "a", columnId: "todo" }),
            task({ id: "b", columnId: "done", completedAt: Date.UTC(2026, 9, 6) }),
            task({ id: "c", columnId: "doing", taskType: null, projectId: "p9" }),
        ]
        const result = aggregateTasks(tasks, columns, projects, new Set(["done"]))

        expect(result.tasksByColumn).toEqual([
            { key: "todo", label: "A Fazer", color: "zinc", count: 1 },
            { key: "doing", label: "Em Andamento", color: "sky", count: 1 },
            { key: "done", label: "Concluído", color: "emerald", count: 1 },
        ])
        expect(result.tasksByType).toEqual([
            { type: "feature", count: 2 },
            { type: "none", count: 1 },
        ])
        expect(result.tasksByProject).toEqual([
            { projectId: "p1", name: "Portal", sigla: "POR", count: 2 },
            { projectId: "p9", name: "Projeto removido", sigla: "", count: 1 },
        ])
        expect(result.tasksInProgress).toBe(2)
    })

    it("inclui coluna desconhecida no fim e não conta colunas vazias", () => {
        const result = aggregateTasks([task({ columnId: "ghost" })], columns, projects, new Set())
        expect(result.tasksByColumn).toEqual([{ key: "ghost", label: "ghost", color: "zinc", count: 1 }])
    })
})

describe("buildTaskTimeline", () => {
    it("preenche buckets vazios com zero e agrupa criadas/concluídas", () => {
        const tasks = [
            task({ id: "a", createdAt: Date.UTC(2026, 9, 5), completedAt: Date.UTC(2026, 9, 5) }),
            task({ id: "b", createdAt: Date.UTC(2026, 9, 7), completedAt: null }),
        ]
        const timeline = buildTaskTimeline(tasks, "day", Date.UTC(2026, 9, 5), Date.UTC(2026, 9, 7), "UTC")
        expect(timeline).toEqual([
            { bucket: "2026-10-05", created: 1, completed: 1 },
            { bucket: "2026-10-06", created: 0, completed: 0 },
            { bucket: "2026-10-07", created: 1, completed: 0 },
        ])
    })
})

describe("financeiro", () => {
    it("mapeia os grupos (cliente removido preservado, serviços inclusos) e monta a série mensal", () => {
        const groups = [
            {
                clientId: "c1",
                clientName: "Acme",
                totalBillingBrl: 450,
                totalClientHours: 4,
                taskCount: 1,
                serviceCount: 1,
                tasks: [
                    { kind: "task" as const, id: "t1", code: "OPX-1", title: "T", project: null, hours: 2, clientHours: 4, billingBrl: 400, completedAt: "2026-10-05T12:00:00.000Z" },
                    { kind: "service" as const, id: "s1", code: "SRV-1", title: "S", project: null, hours: 1, clientHours: 0, billingBrl: 50, serviceDate: "2026-10-20T00:00:00.000Z", taskId: null, archived: false },
                ],
            },
            {
                clientId: null,
                clientName: "Cliente removido",
                totalBillingBrl: 100,
                totalClientHours: 1,
                taskCount: 1,
                serviceCount: 0,
                tasks: [{ kind: "task" as const, id: "t2", code: "OPX-2", title: "U", project: null, hours: 1, clientHours: 1, billingBrl: 100, completedAt: "2026-09-20T12:00:00.000Z" }],
            },
        ]
        expect(aggregateFinanceClients(groups)).toEqual([
            { clientId: "c1", clientName: "Acme", billingBrl: 450, clientHours: 4, taskCount: 1, serviceCount: 1 },
            { clientId: null, clientName: "Cliente removido", billingBrl: 100, clientHours: 1, taskCount: 1, serviceCount: 0 },
        ])
        const timeline = buildFinanceTimeline(groups, Date.UTC(2026, 8, 1), Date.UTC(2026, 9, 31), "UTC")
        expect(timeline).toEqual([
            { bucket: "2026-09", billingBrl: 100 },
            { bucket: "2026-10", billingBrl: 450 },
        ])
    })
})

describe("aggregateTimeLogs", () => {
    it("soma horas/custo, agrupa por projeto, etapa e modelo e ignora tokens zerados", () => {
        const logs = [
            { projectId: "p1", stage: "implementing", model: "openai/gpt", duration: 30, costUsd: 1.5, inputTokens: 100, outputTokens: 50, reasoningTokens: 10, startTime: Date.UTC(2026, 9, 5, 12) },
            { projectId: null, stage: null, model: null, duration: null, costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, startTime: Date.UTC(2026, 9, 6, 12) },
        ]
        const result = aggregateTimeLogs(logs, projects, "day", Date.UTC(2026, 9, 5), Date.UTC(2026, 9, 6), "UTC")

        expect(result.loggedMinutes).toBe(30)
        expect(result.costUsd).toBe(1.5)
        expect(result.timeByDay).toEqual([
            { bucket: "2026-10-05", minutes: 30, costUsd: 1.5 },
            { bucket: "2026-10-06", minutes: 0, costUsd: 0 },
        ])
        expect(result.costByProject).toEqual([{ projectId: "p1", name: "Portal", sigla: "POR", minutes: 30, costUsd: 1.5 }])
        expect(result.timeByStage).toEqual([{ stage: "implementing", label: "Implementando", minutes: 30 }])
        expect(result.tokensByModel).toEqual([{ model: "openai/gpt", inputTokens: 100, outputTokens: 50, reasoningTokens: 10, totalTokens: 160 }])
    })
})

describe("aggregateWorkbenches", () => {
    it("conta o funil por passo, mesas ativas/executando e custo acumulado por projeto", () => {
        const workbenches = [
            { stage: "implementing", runState: "running", projectId: "p1", costUsd: 2 },
            { stage: "build_queued", runState: "idle", projectId: "p1", costUsd: 1 },
            { stage: "done", runState: "idle", projectId: "p1", costUsd: 5 },
        ]
        const result = aggregateWorkbenches(workbenches, projects)

        expect(result.activeWorkbenches).toBe(2)
        expect(result.runningWorkbenches).toBe(1)
        expect(result.workbenchFunnel).toEqual([
            { step: "plan", label: "Plano", count: 0 },
            { step: "implement", label: "Implementação", count: 1 },
            { step: "preview", label: "Prévia", count: 1 },
            { step: "pr", label: "Pull Request", count: 0 },
            { step: "done", label: "Concluída", count: 1 },
        ])
        expect(result.workbenchByProject).toEqual([{ projectId: "p1", name: "Portal", sigla: "POR", count: 2 }])
        expect(result.workbenchCostByProject).toEqual([{ projectId: "p1", name: "Portal", sigla: "POR", costUsd: 3 }])
    })
})
