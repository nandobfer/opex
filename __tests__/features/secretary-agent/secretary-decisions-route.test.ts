import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ find: vi.fn(), count: vi.fn(), skip: vi.fn(), limit: vi.fn(), lean: vi.fn() }))
vi.mock("@/features/auth/server/context", () => ({ requireAdminSession: vi.fn() }))
vi.mock("@/features/secretary-agent/server/models", () => ({
    secretaryDb: vi.fn(),
    SecretaryDecisionRecord: {
        find: (filter: unknown) => {
            mocks.find(filter)
            const query = { sort: () => query, skip: (n: number) => (mocks.skip(n), query), limit: (n: number) => (mocks.limit(n), query), select: () => query, lean: mocks.lean }
            return query
        },
        countDocuments: mocks.count,
    },
}))

import { GET } from "@/app/api/secretary/decisions/route"

const call = (query: string) => GET(new NextRequest(`http://localhost/api/secretary/decisions${query}`), { params: Promise.resolve({}) })

beforeEach(() => {
    vi.clearAllMocks()
    mocks.lean.mockResolvedValue([{ _id: "opex:M1", jid: "5531999999999@s.whatsapp.net", decision: "replied", reason: "ok", at: new Date("2026-11-26T10:00:00Z"), topic: "x" }])
    mocks.count.mockResolvedValue(120)
})

describe("GET /api/secretary/decisions (aba Decisões, OPE-197)", () => {
    it("D9: filtra várias conversas, decisões e período, e pagina com o total", async () => {
        const response = await call("?jid=5531999999999@s.whatsapp.net,123@g.us&decision=replied,ignored&from=2026-11-01T03:00:00.000Z&to=2026-11-02T02:59:59.999Z&page=2")
        expect(response.status).toBe(200)
        expect(mocks.find).toHaveBeenCalledWith({
            jid: { $in: ["5531999999999@s.whatsapp.net", "123@g.us"] },
            decision: { $in: ["replied", "ignored"] },
            at: { $gte: new Date("2026-11-01T03:00:00.000Z"), $lte: new Date("2026-11-02T02:59:59.999Z") },
        })
        expect(mocks.skip).toHaveBeenCalledWith(50)
        expect(mocks.limit).toHaveBeenCalledWith(50)
        const { data } = await response.json()
        expect(data).toMatchObject({ page: 2, limit: 50, total: 120, totalPages: 3 })
        expect(data.items).toEqual([{ _id: "opex:M1", jid: "5531999999999@s.whatsapp.net", decision: "replied", reason: "ok", at: "2026-11-26T10:00:00.000Z" }])
    })

    it("o jid único do contrato antigo continua valendo e, sem filtros, devolve tudo", async () => {
        await call("?jid=5531999999999@s.whatsapp.net")
        expect(mocks.find).toHaveBeenLastCalledWith({ jid: { $in: ["5531999999999@s.whatsapp.net"] } })
        await call("")
        expect(mocks.find).toHaveBeenLastCalledWith({})
    })

    it("parâmetro inválido devolve 400", async () => {
        expect((await call("?decision=inventada")).status).toBe(400)
        expect((await call("?limit=500")).status).toBe(400)
    })
})
