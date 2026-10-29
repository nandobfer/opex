import { describe, expect, it } from "vitest"
import { endOfDay, parseISO, startOfDay } from "date-fns"
import { parseUrlFilters, serializeUrlFilters } from "@/hooks/useUrlFilters"
import { DEFAULT_PR_REVIEW_FILTERS, hasPrReviewFilters, PR_REVIEW_FILTER_SCHEMA, toPrReviewListParams } from "@/features/pr-review/filters"

describe("filtros da página Agente Revisor (URL)", () => {
    it("lê os filtros da URL e descarta valores desconhecidos ou malformados", () => {
        const filters = parseUrlFilters("?q=login&states=running,xyz&verdicts=approved&repos=org/app,inv%C3%A1lido&triggers=manual,outro&from=2026-10-01", DEFAULT_PR_REVIEW_FILTERS, PR_REVIEW_FILTER_SCHEMA)
        expect(filters).toEqual({ q: "login", states: ["running"], verdicts: ["approved"], repos: ["org/app"], triggers: ["manual"], from: "2026-10-01", to: "" })
    })

    it("sem parâmetros, nenhum recorte; e o padrão não vai para a URL", () => {
        expect(parseUrlFilters("", DEFAULT_PR_REVIEW_FILTERS, PR_REVIEW_FILTER_SCHEMA)).toEqual(DEFAULT_PR_REVIEW_FILTERS)
        expect(serializeUrlFilters("", DEFAULT_PR_REVIEW_FILTERS, DEFAULT_PR_REVIEW_FILTERS, PR_REVIEW_FILTER_SCHEMA)).toBe("")
        expect(serializeUrlFilters("", { ...DEFAULT_PR_REVIEW_FILTERS, states: ["queued", "failed"] }, DEFAULT_PR_REVIEW_FILTERS, PR_REVIEW_FILTER_SCHEMA)).toBe("states=queued%2Cfailed")
    })

    it("há filtro com busca, período ou qualquer multiseleção (busca só com espaços não conta)", () => {
        expect(hasPrReviewFilters(DEFAULT_PR_REVIEW_FILTERS)).toBe(false)
        expect(hasPrReviewFilters({ ...DEFAULT_PR_REVIEW_FILTERS, q: "   " })).toBe(false)
        expect(hasPrReviewFilters({ ...DEFAULT_PR_REVIEW_FILTERS, triggers: ["auto"] })).toBe(true)
        expect(hasPrReviewFilters({ ...DEFAULT_PR_REVIEW_FILTERS, to: "2026-10-02" })).toBe(true)
    })

    it("vira parâmetros da API: listas em CSV e período do dia inteiro em ISO", () => {
        const params = toPrReviewListParams({ q: " #12 ", states: ["done"], verdicts: [], repos: ["org/app", "org/api"], triggers: [], from: "2026-10-01", to: "2026-10-02" })
        expect(params).toEqual({
            q: "#12",
            states: "done",
            repos: "org/app,org/api",
            from: startOfDay(parseISO("2026-10-01")).toISOString(),
            to: endOfDay(parseISO("2026-10-02")).toISOString(),
        })
        expect(toPrReviewListParams(DEFAULT_PR_REVIEW_FILTERS)).toEqual({})
    })

    it("data inválida em from/to é descartada e não quebra a conversão para a API", () => {
        const filters = parseUrlFilters("?from=abc&to=2026-13-45", DEFAULT_PR_REVIEW_FILTERS, PR_REVIEW_FILTER_SCHEMA)
        expect(filters).toMatchObject({ from: "", to: "" })
        expect(parseUrlFilters("?from=2026-10-0", DEFAULT_PR_REVIEW_FILTERS, PR_REVIEW_FILTER_SCHEMA).from).toBe("")
        expect(() => toPrReviewListParams({ ...DEFAULT_PR_REVIEW_FILTERS, from: "abc", to: "2026-10" })).not.toThrow()
        expect(toPrReviewListParams({ ...DEFAULT_PR_REVIEW_FILTERS, from: "abc", to: "2026-10" })).toEqual({})
    })
})
