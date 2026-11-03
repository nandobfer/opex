import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ updateMany: vi.fn(), warn: vi.fn() }))

vi.mock("@/lib/db/models/FinanceService", () => ({ FinanceService: { updateMany: mocks.updateMany } }))
vi.mock("@/lib/logger", () => ({ logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn() } }))

import { MIDNIGHT_UTC_SERVICE_FILTER, SERVICE_DATE_TO_NOON_UPDATE, normalizeServiceDates } from "@/lib/db/migrations/normalize-service-dates"
import { serviceDateFromInput } from "@/features/services/logic"

/**
 * Avaliador mínimo das expressões de agregação usadas pela migração, com a semântica do MongoDB
 * (`$hour`/`$minute`/`$second`/`$millisecond` em UTC, `$add` de data + ms). Expressão desconhecida
 * falha o teste, para que uma troca de operador não passe despercebida.
 */
type Doc = { serviceDate: Date }
function evaluate(expr: unknown, doc: Doc): unknown {
    if (typeof expr === "string" && expr.startsWith("$")) return doc[expr.slice(1) as keyof Doc]
    if (typeof expr !== "object" || expr === null || expr instanceof Date) return expr
    const [op, arg] = Object.entries(expr)[0]!
    const date = () => evaluate(arg, doc) as Date
    switch (op) {
        case "$and":
            return (arg as unknown[]).every((item) => evaluate(item, doc) === true)
        case "$eq": {
            const [a, b] = (arg as unknown[]).map((item) => evaluate(item, doc))
            return a === b
        }
        case "$hour":
            return date().getUTCHours()
        case "$minute":
            return date().getUTCMinutes()
        case "$second":
            return date().getUTCSeconds()
        case "$millisecond":
            return date().getUTCMilliseconds()
        case "$add": {
            const [base, ms] = (arg as unknown[]).map((item) => evaluate(item, doc))
            return new Date((base as Date).getTime() + (ms as number))
        }
        default:
            throw new Error(`Operador não suportado no teste: ${op}`)
    }
}

const matches = (doc: Doc) => evaluate(MIDNIGHT_UTC_SERVICE_FILTER.$expr, doc) === true
const migrate = (doc: Doc): Doc => ({ serviceDate: evaluate(SERVICE_DATE_TO_NOON_UPDATE[0]!.$set.serviceDate, doc) as Date })

beforeEach(() => vi.clearAllMocks())

describe("migração das datas de serviço para o meio-dia UTC (OPE-125)", () => {
    it("o filtro pega só a meia-noite UTC exata, nunca o meio-dia nem outro horário", () => {
        expect(matches({ serviceDate: new Date("2026-11-01T00:00:00.000Z") })).toBe(true)
        expect(matches({ serviceDate: new Date("2026-11-01T12:00:00.000Z") })).toBe(false)
        expect(matches({ serviceDate: new Date("2026-11-01T03:00:00.000Z") })).toBe(false)
        expect(matches({ serviceDate: new Date("2026-11-01T00:00:00.001Z") })).toBe(false)
        expect(matches({ serviceDate: new Date("2026-11-01T00:00:01.000Z") })).toBe(false)
        expect(matches({ serviceDate: new Date("2026-11-01T00:01:00.000Z") })).toBe(false)
    })

    it("o pipeline leva a meia-noite antiga ao instante da gravação nova, e o resultado não é pego de novo", () => {
        const migrated = migrate({ serviceDate: new Date("2026-11-01T00:00:00.000Z") })
        expect(migrated.serviceDate.getTime()).toBe(serviceDateFromInput("2026-11-01")!.getTime())
        expect(matches(migrated)).toBe(false)
    })

    it("aplica filtro e pipeline com updatePipeline e registra a contagem", async () => {
        mocks.updateMany.mockResolvedValue({ modifiedCount: 2 })
        await normalizeServiceDates()
        expect(mocks.updateMany).toHaveBeenCalledWith(MIDNIGHT_UTC_SERVICE_FILTER, SERVICE_DATE_TO_NOON_UPDATE, { updatePipeline: true })
        expect(mocks.warn).toHaveBeenCalledWith({ modified: 2 }, expect.any(String))
    })

    it("sem registros antigos não registra nada (idempotente)", async () => {
        mocks.updateMany.mockResolvedValue({ modifiedCount: 0 })
        await normalizeServiceDates()
        expect(mocks.warn).not.toHaveBeenCalled()
    })
})
