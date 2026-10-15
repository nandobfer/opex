import { describe, expect, it } from "vitest"
import {
    currentMonth,
    defaultFinanceFilters,
    financeClientOptions,
    financeHttpParams,
    financeQuery,
    financeQueryRange,
    financeRepoOptions,
    hasSelectionFilters,
    normalizeIds,
} from "@/features/finance/filters"
import type { ProjectRef } from "@/features/tasks/types"

/** Regras puras dos filtros do Financeiro: normalização dos ids, parâmetros da API e opções. */

describe("filtros do financeiro (puros)", () => {
    it("mês corrente vai do dia 1 até hoje", () => {
        const { from, to } = currentMonth()
        expect(from).toMatch(/^\d{4}-\d{2}-01$/)
        expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(from <= to).toBe(true)
    })

    it("filtros padrão: mês corrente sem seleções", () => {
        expect(defaultFinanceFilters()).toEqual({ ...currentMonth(), clientIds: [], projectIds: [], archived: "" })
    })

    it("normaliza ids: remove vazios e duplicatas e ordena", () => {
        expect(normalizeIds(["b", "a", "b", ""])).toEqual(["a", "b"])
    })

    it("converte o período em ISO de início/fim do dia; vazio continua vazio", () => {
        const range = financeQueryRange({ from: "2026-10-05", to: "2026-10-06" })
        expect(range.from).toBe(new Date(2026, 9, 5, 0, 0, 0, 0).toISOString())
        expect(range.to).toBe(new Date(2026, 9, 6, 23, 59, 59, 999).toISOString())
        expect(financeQueryRange({ from: "", to: "" })).toEqual({ from: "", to: "" })
    })

    it("monta a consulta normalizada a partir dos filtros", () => {
        const query = financeQuery({ from: "2026-10-05", to: "2026-10-06", clientIds: ["c2", "c1", "c2"], projectIds: ["p1"], archived: "" })
        expect(query.clientIds).toEqual(["c1", "c2"])
        expect(query.projectIds).toEqual(["p1"])
        expect(query.from).toBe(new Date(2026, 9, 5, 0, 0, 0, 0).toISOString())
        expect(query.includeArchived).toBe(false)
    })

    it("liga a consulta de arquivados com o filtro ativo", () => {
        const query = financeQuery({ from: "", to: "", clientIds: [], projectIds: [], archived: "1" })
        expect(query.includeArchived).toBe(true)
        expect(financeHttpParams(query).archived).toBe("1")
    })

    it("serializa os parâmetros HTTP com listas separadas por vírgula", () => {
        const params = financeHttpParams({ from: "2026-10-05T03:00:00.000Z", to: "", clientIds: ["c1", "c2"], projectIds: [], includeArchived: false })
        expect(params).toEqual({ from: "2026-10-05T03:00:00.000Z", to: undefined, clientIds: "c1,c2", projectIds: undefined, archived: undefined })
    })

    it("detecta filtros de seleção ativos", () => {
        expect(hasSelectionFilters({ clientIds: [], projectIds: [] })).toBe(false)
        expect(hasSelectionFilters({ clientIds: ["c1"], projectIds: [] })).toBe(true)
        expect(hasSelectionFilters({ clientIds: [], projectIds: ["p1"] })).toBe(true)
    })

    it("opções de clientes e repositórios saem ordenadas", () => {
        expect(financeClientOptions([{ id: "2", name: "Beta" }, { id: "1", name: "Alfa" }])).toEqual([
            { value: "1", label: "Alfa" },
            { value: "2", label: "Beta" },
        ])

        const projects: ProjectRef[] = [
            { id: "p2", name: "Zeta", repo: "org/zeta", sigla: "Z" },
            { id: "p1", name: "Alfa", repo: "org/alfa", sigla: "A" },
        ]
        const options = financeRepoOptions(projects)
        expect(options.map((option) => option.label)).toEqual(["org/alfa", "org/zeta"])
        expect(options[0]).toEqual({ value: "p1", label: "org/alfa", project: projects[1] })
    })
})
