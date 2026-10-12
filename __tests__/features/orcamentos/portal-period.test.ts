import { describe, expect, it } from "vitest"
import { CLIENTE_PERIOD_OPTIONS, CLIENTE_PERIOD_STORAGE_KEY } from "@/features/orcamentos/portal/period"
import { clienteFinanceHttpParams, clienteFinanceQuery, defaultClienteFinanceFilters, hasClienteRepoFilter } from "@/features/orcamentos/portal/filters"
import { randomUsernameSuffix, usernameFromName, USERNAME_PATTERN } from "@/features/orcamentos/logic"

describe("período do portal", () => {
    it("usa as mesmas opções e rótulos do dashboard do dono, com chave própria de persistência", () => {
        expect(CLIENTE_PERIOD_OPTIONS.map((option) => option.value)).toEqual(["7d", "30d", "90d", "month"])
        expect(CLIENTE_PERIOD_OPTIONS.map((option) => option.label)).toEqual(["7 dias", "30 dias", "90 dias", "Mês atual"])
        // A preferência do cliente não compartilha a chave do dono.
        expect(CLIENTE_PERIOD_STORAGE_KEY).not.toContain("opex:dashboard")
        expect(CLIENTE_PERIOD_STORAGE_KEY.startsWith("opex:cliente:")).toBe(true)
    })
})

describe("filtros do financeiro do portal", () => {
    it("o padrão é o mês corrente, sem repositório selecionado", () => {
        const filters = defaultClienteFinanceFilters()
        expect(filters.from).toMatch(/^\d{4}-\d{2}-01$/)
        expect(filters.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(filters.projectIds).toEqual([])
        expect(hasClienteRepoFilter(filters)).toBe(false)
    })

    it("normaliza o período (início e fim do dia) e os ids dos repositórios", () => {
        const query = clienteFinanceQuery({ from: "2026-03-01", to: "2026-03-31", projectIds: ["b", "a", "b", ""] })

        expect(query.projectIds).toEqual(["a", "b"])
        const from = new Date(query.from)
        expect([from.getDate(), from.getHours(), from.getMinutes()]).toEqual([1, 0, 0])
        const to = new Date(query.to)
        expect([to.getDate(), to.getHours()]).toEqual([31, 23])
    })

    it("sem período, a consulta vai sem datas e os parâmetros HTTP omitem a lista vazia", () => {
        const query = clienteFinanceQuery({ from: "", to: "", projectIds: [] })
        expect(query).toEqual({ from: "", to: "", projectIds: [] })
        expect(clienteFinanceHttpParams(query)).toEqual({ from: undefined, to: undefined, projectIds: undefined })
    })

    it("com repositórios selecionados, os parâmetros HTTP levam a lista separada por vírgula", () => {
        const query = clienteFinanceQuery({ from: "2026-03-01", to: "2026-03-31", projectIds: ["p2", "p1"] })
        const params = clienteFinanceHttpParams(query)
        expect(params.projectIds).toBe("p1,p2")
        expect(hasClienteRepoFilter({ projectIds: query.projectIds })).toBe(true)
    })
})

describe("username do usuário de cliente", () => {
    it("gera slug a partir do nome (sem acento, minúsculo, hífen)", () => {
        expect(usernameFromName("Acme Corp")).toBe("acme-corp")
        expect(usernameFromName("  Loja São João! ")).toBe("loja-sao-joao")
        expect(usernameFromName("###")).toBe("cliente")
    })

    it("o slug sempre passa na regra de username", () => {
        for (const name of ["Acme Corp", "Loja São João!", "###"]) {
            expect(USERNAME_PATTERN.test(usernameFromName(name))).toBe(true)
        }
    })

    it("o sufixo de desempate é alfabético curto e determinístico com o random injetado", () => {
        expect(randomUsernameSuffix(4, () => 0)).toBe("aaaa")
        expect(randomUsernameSuffix(4, () => 0.999999)).toMatch(/^[a-z]{4}$/)
        expect(randomUsernameSuffix(4)).toMatch(/^[a-z]{4}$/)
    })
})
