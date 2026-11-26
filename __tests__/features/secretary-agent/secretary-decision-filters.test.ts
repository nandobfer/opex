import { describe, expect, it } from "vitest"
import { parseUrlFilters } from "@/hooks/useUrlFilters"
import { DECISION_FILTER_SCHEMA, DEFAULT_DECISION_FILTERS, hasDecisionFilters, toDecisionListParams } from "@/features/secretary-agent/decision-filters"

describe("filtros da aba Decisões (OPE-197)", () => {
    it("D9: URL → conversas, decisões e período; valores inválidos somem", () => {
        const filters = parseUrlFilters("?conversas=5531999999999@s.whatsapp.net,lixo&decisoes=replied,inventada&de=2026-11-01&ate=2026-13-40", DEFAULT_DECISION_FILTERS, DECISION_FILTER_SCHEMA)
        expect(filters).toEqual({ conversas: ["5531999999999@s.whatsapp.net"], decisoes: ["replied"], de: "2026-11-01", ate: "" })
        expect(hasDecisionFilters(filters)).toBe(true)
        expect(hasDecisionFilters(DEFAULT_DECISION_FILTERS)).toBe(false)
    })

    it("parâmetros da API em CSV e período do dia inteiro em ISO", () => {
        const params = toDecisionListParams({ conversas: ["a@s.whatsapp.net", "b@g.us"], decisoes: ["ignored", "error"], de: "2026-11-01", ate: "2026-11-02" })
        expect(params.jid).toBe("a@s.whatsapp.net,b@g.us")
        expect(params.decision).toBe("ignored,error")
        expect(new Date(params.from!).getHours()).toBe(0)
        expect(new Date(params.to!).getHours()).toBe(23)
        expect(toDecisionListParams(DEFAULT_DECISION_FILTERS)).toEqual({})
    })
})
