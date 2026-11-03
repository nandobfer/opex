import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ updateMany: vi.fn(), warn: vi.fn() }))

vi.mock("@/lib/db/models/FinanceService", () => ({ FinanceService: { updateMany: mocks.updateMany } }))
vi.mock("@/lib/logger", () => ({ logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn() } }))

import { MIDNIGHT_UTC_SERVICE_FILTER, SERVICE_DATE_TO_NOON_UPDATE, normalizeServiceDates } from "@/lib/db/migrations/normalize-service-dates"
import { serviceDateFromInput } from "@/features/services/logic"

beforeEach(() => vi.clearAllMocks())

describe("migração das datas de serviço para o meio-dia UTC (OPE-125)", () => {
    it("move só os registros à meia-noite UTC, somando 12 h pelo pipeline", async () => {
        mocks.updateMany.mockResolvedValue({ modifiedCount: 2 })
        await normalizeServiceDates()
        expect(mocks.updateMany).toHaveBeenCalledWith(MIDNIGHT_UTC_SERVICE_FILTER, SERVICE_DATE_TO_NOON_UPDATE, { updatePipeline: true })
        expect(mocks.warn).toHaveBeenCalledWith({ modified: 2 }, expect.any(String))
    })

    it("o deslocamento leva a meia-noite antiga ao mesmo instante que a gravação nova", () => {
        const shift = (SERVICE_DATE_TO_NOON_UPDATE[0]!.$set.serviceDate.$add[1] as number)
        expect(new Date(new Date("2026-11-01T00:00:00.000Z").getTime() + shift).getTime()).toBe(serviceDateFromInput("2026-11-01")!.getTime())
    })

    it("sem registros antigos não registra nada (idempotente)", async () => {
        mocks.updateMany.mockResolvedValue({ modifiedCount: 0 })
        await normalizeServiceDates()
        expect(mocks.warn).not.toHaveBeenCalled()
    })
})
