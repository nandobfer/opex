import { describe, expect, it } from "vitest"
import { prReviewListQuerySchema } from "@/features/pr-review/schemas"
import { buildPrReviewListFilter } from "@/features/pr-review/server/list-query"

const none = { q: "", states: [], verdicts: [], repos: [], triggers: [] }

describe("lista do Agente Revisor: query da API", () => {
    it("converte CSV em listas e aplica página e limite padrão", () => {
        const query = prReviewListQuerySchema.parse({ states: "queued,running", repos: "org/app", triggers: "manual" })
        expect(query).toMatchObject({ q: "", states: ["queued", "running"], verdicts: [], repos: ["org/app"], triggers: ["manual"], page: 1, limit: 20 })
    })

    it("rejeita situação desconhecida, repositório malformado e limite acima de 50", () => {
        expect(prReviewListQuerySchema.safeParse({ states: "xyz" }).success).toBe(false)
        expect(prReviewListQuerySchema.safeParse({ repos: "sem-barra" }).success).toBe(false)
        expect(prReviewListQuerySchema.safeParse({ limit: "51" }).success).toBe(false)
        expect(prReviewListQuerySchema.safeParse({ from: "ontem" }).success).toBe(false)
    })
})

describe("lista do Agente Revisor: filtro do Mongo", () => {
    it("sem filtros, tudo", () => {
        expect(buildPrReviewListFilter(none)).toEqual({})
    })

    it("combina situação, veredito, repositório e período", () => {
        const filter = buildPrReviewListFilter({ ...none, states: ["done"], verdicts: ["approved", "commented"], repos: ["org/app"], from: "2026-10-01T03:00:00.000Z", to: "2026-10-02T02:59:59.999Z" })
        expect(filter).toEqual({
            state: { $in: ["done"] },
            verdict: { $in: ["approved", "commented"] },
            repo: { $in: ["org/app"] },
            createdAt: { $gte: new Date("2026-10-01T03:00:00.000Z"), $lte: new Date("2026-10-02T02:59:59.999Z") },
        })
    })

    it("período só com início ou só com fim", () => {
        expect(buildPrReviewListFilter({ ...none, from: "2026-10-01T00:00:00.000Z" })).toEqual({ createdAt: { $gte: new Date("2026-10-01T00:00:00.000Z") } })
        expect(buildPrReviewListFilter({ ...none, to: "2026-10-01T00:00:00.000Z" })).toEqual({ createdAt: { $lte: new Date("2026-10-01T00:00:00.000Z") } })
    })

    it("busca escapa caracteres de regex e casa repo, título e autor", () => {
        const filter = buildPrReviewListFilter({ ...none, q: "fix(api)." })
        const pattern = { $regex: "fix\\(api\\)\\.", $options: "i" }
        expect(filter).toEqual({ $or: [{ repo: pattern }, { title: pattern }, { author: pattern }] })
        expect(new RegExp(pattern.$regex, "i").test("Fix(API). login")).toBe(true)
        expect(new RegExp(pattern.$regex, "i").test("fixXapiY")).toBe(false)
    })

    it("busca numérica (com ou sem #) também filtra pelo número do PR", () => {
        const filter = buildPrReviewListFilter({ ...none, q: "#12" }) as { $or: Record<string, unknown>[] }
        expect(filter.$or).toContainEqual({ number: 12 })
    })

    it("origem: manual, automática (inclui revisões antigas sem origem) ou as duas (sem recorte)", () => {
        expect(buildPrReviewListFilter({ ...none, triggers: ["manual"] })).toEqual({ trigger: "manual" })
        expect(buildPrReviewListFilter({ ...none, triggers: ["auto"] })).toEqual({ trigger: { $ne: "manual" } })
        expect(buildPrReviewListFilter({ ...none, triggers: ["auto", "manual"] })).toEqual({})
    })

    it("busca e origem juntas ficam num $and", () => {
        const filter = buildPrReviewListFilter({ ...none, q: "x", triggers: ["manual"] })
        expect(filter.$and).toHaveLength(2)
    })
})
