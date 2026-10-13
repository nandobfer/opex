import { describe, expect, it } from "vitest"
import { clienteOrcamentoSchema } from "@/features/orcamentos/schemas"

const PROJECT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa"

const valid = (overrides: Record<string, unknown> = {}) => ({
    name: "Acme",
    projectIds: [],
    hourlyRate: 40,
    profitFactor: 10,
    active: true,
    ...overrides,
})

describe("clienteOrcamentoSchema — repositórios opcionais", () => {
    it("aceita o cliente sem nenhum repositório (vincular depois)", () => {
        const parsed = clienteOrcamentoSchema.safeParse(valid())
        expect(parsed.success).toBe(true)
        expect(parsed.success && parsed.data.projectIds).toEqual([])
    })

    it("aceita os repositórios escolhidos quando existem", () => {
        const parsed = clienteOrcamentoSchema.safeParse(valid({ projectIds: [PROJECT_ID] }))
        expect(parsed.success).toBe(true)
        expect(parsed.success && parsed.data.projectIds).toEqual([PROJECT_ID])
    })

    it("continua recusando identificador de repositório inválido", () => {
        const parsed = clienteOrcamentoSchema.safeParse(valid({ projectIds: ["nao-e-id"] }))
        expect(parsed.success).toBe(false)
    })

    it("continua exigindo nome e valores financeiros válidos", () => {
        expect(clienteOrcamentoSchema.safeParse(valid({ name: "  " })).success).toBe(false)
        expect(clienteOrcamentoSchema.safeParse(valid({ hourlyRate: -1 })).success).toBe(false)
        expect(clienteOrcamentoSchema.safeParse(valid({ profitFactor: 0.5 })).success).toBe(false)
        expect(clienteOrcamentoSchema.safeParse(valid({ profitFactor: 101 })).success).toBe(false)
    })
})
