import { describe, expect, it } from "vitest"
import { financeQuerySchema } from "@/features/finance/schemas"

/** Contrato da rota do financeiro: período ISO e listas de ids separadas por vírgula. */

const id = (n: number) => n.toString(16).padStart(24, "0")

describe("financeQuerySchema", () => {
    it("aceita período e listas separadas por vírgula, sem duplicatas", () => {
        const parsed = financeQuerySchema.parse({
            from: "2026-10-01T00:00:00.000Z",
            clientIds: `${id(1)},${id(2)},${id(1)}`,
            projectIds: "",
        })
        expect(parsed.from).toBe("2026-10-01T00:00:00.000Z")
        expect(parsed.clientIds).toEqual([id(1), id(2)])
        expect(parsed.projectIds).toEqual([])
    })

    it("recusa identificador malformado", () => {
        expect(financeQuerySchema.safeParse({ clientIds: "nao-e-id" }).success).toBe(false)
        expect(financeQuerySchema.safeParse({ projectIds: `${id(1)},xyz` }).success).toBe(false)
    })

    it("sem filtros devolve listas vazias", () => {
        const parsed = financeQuerySchema.parse({})
        expect(parsed.clientIds).toEqual([])
        expect(parsed.projectIds).toEqual([])
        expect(parsed.from).toBeUndefined()
        expect(parsed.to).toBeUndefined()
    })

    it("recusa data inválida", () => {
        expect(financeQuerySchema.safeParse({ from: "ontem" }).success).toBe(false)
    })

    it("interpreta o filtro de arquivados", () => {
        expect(financeQuerySchema.parse({}).archived).toBe(false)
        expect(financeQuerySchema.parse({ archived: "1" }).archived).toBe(true)
        expect(financeQuerySchema.safeParse({ archived: "sim" }).success).toBe(false)
    })
})
