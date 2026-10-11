import { describe, expect, it } from "vitest"
import { aggregateFinance, completionTimestamps, type CompletionAuditLog, type FinanceTaskInput } from "@/features/finance/logic"

const DONE = "done"
const DOING = "doing"
const nameToKey = new Map([
    ["Em Andamento", DOING],
    ["Concluído", DONE],
])
const closedKeys = new Set([DONE])

const audit = (overrides: Partial<CompletionAuditLog> = {}): CompletionAuditLog => ({
    entidadeId: "t1",
    acao: "MOVER",
    dadosNovos: { coluna: "Concluído" },
    timestamp: new Date("2026-10-05T12:00:00.000Z"),
    ...overrides,
})

describe("completionTimestamps", () => {
    it("casa MOVER pelo nome da coluna de destino (name → key)", () => {
        const map = completionTimestamps([audit()], closedKeys, nameToKey)
        expect(map.get("t1")).toBe(new Date("2026-10-05T12:00:00.000Z").getTime())
    })

    it("casa ATUALIZAR pela key da coluna de destino", () => {
        const map = completionTimestamps([audit({ acao: "ATUALIZAR", dadosNovos: { coluna: DONE } })], closedKeys, nameToKey)
        expect(map.get("t1")).toBe(new Date("2026-10-05T12:00:00.000Z").getTime())
    })

    it("ignora eventos cujo destino não é coluna de conclusão", () => {
        const map = completionTimestamps([audit({ acao: "ATUALIZAR", dadosNovos: { coluna: DOING } })], closedKeys, nameToKey)
        expect(map.size).toBe(0)
    })

    it("mantém o maior timestamp por tarefa", () => {
        const early = new Date("2026-10-01T10:00:00.000Z")
        const late = new Date("2026-10-09T10:00:00.000Z")
        const map = completionTimestamps([audit({ timestamp: early }), audit({ timestamp: late }), audit({ timestamp: new Date("2026-10-05T10:00:00.000Z") })], closedKeys, nameToKey)
        expect(map.get("t1")).toBe(late.getTime())
    })

    it("ignora logs sem dadosNovos.coluna", () => {
        const map = completionTimestamps([audit({ dadosNovos: {} }), audit({ dadosNovos: null })], closedKeys, nameToKey)
        expect(map.size).toBe(0)
    })
})

const task = (overrides: Partial<FinanceTaskInput> = {}): FinanceTaskInput => ({
    id: Math.random().toString(16).slice(2).padEnd(24, "0"),
    code: "OPX-1",
    title: "Tarefa",
    project: null,
    clientId: "c1",
    hours: 1,
    clientHours: 2,
    billingBrl: 100,
    completedAt: new Date("2026-10-05T12:00:00.000Z").getTime(),
    ...overrides,
})

describe("aggregateFinance", () => {
    it("agrupa por cliente, soma os totais e ordena por faturamento desc", () => {
        const clients = new Map([
            ["c1", "Cliente A"],
            ["c2", "Cliente B"],
        ])
        const result = aggregateFinance(
            [
                task({ clientId: "c1", code: "OPX-1", billingBrl: 100, hours: 1, clientHours: 2 }),
                task({ clientId: "c2", code: "OPX-2", billingBrl: 400, hours: 2, clientHours: 4 }),
                task({ clientId: "c1", code: "OPX-3", billingBrl: 50, hours: 0.5, clientHours: 1 }),
            ],
            clients,
            { from: null, to: null },
        )

        expect(result.groups.map((group) => group.clientName)).toEqual(["Cliente B", "Cliente A"])
        expect(result.groups[1]).toMatchObject({ clientId: "c1", taskCount: 2, totalBillingBrl: 150, totalHours: 1.5, totalClientHours: 3 })
        expect(result.totals).toMatchObject({ taskCount: 3, totalBillingBrl: 550, totalHours: 3.5, totalClientHours: 7 })
    })

    it("agrupa clientes sem registro em um único 'Cliente removido'", () => {
        const result = aggregateFinance([task({ clientId: "orfa-1", billingBrl: 10 }), task({ clientId: "orfa-2", billingBrl: 20 })], new Map(), { from: null, to: null })

        expect(result.groups).toHaveLength(1)
        expect(result.groups[0]).toMatchObject({ clientId: null, clientName: "Cliente removido", taskCount: 2, totalBillingBrl: 30 })
    })

    it("ordena as tarefas do grupo pela conclusão mais recente", () => {
        const result = aggregateFinance(
            [
                task({ code: "OPX-1", completedAt: new Date("2026-10-01T10:00:00.000Z").getTime() }),
                task({ code: "OPX-2", completedAt: new Date("2026-10-09T10:00:00.000Z").getTime() }),
            ],
            new Map([["c1", "Cliente A"]]),
            { from: null, to: null },
        )
        expect(result.groups[0].tasks.map((item) => item.code)).toEqual(["OPX-2", "OPX-1"])
    })

    it("ecoa o período e zera quando não há tarefas", () => {
        const result = aggregateFinance([], new Map(), { from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T00:00:00.000Z" })
        expect(result.groups).toEqual([])
        expect(result.from).toBe("2026-10-01T00:00:00.000Z")
        expect(result.totals).toEqual({ taskCount: 0, totalHours: 0, totalClientHours: 0, totalBillingBrl: 0 })
    })
})
