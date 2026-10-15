import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/** Rota do financeiro: período + listas de clientes/repositórios encaminhadas ao serviço. */

const mocks = vi.hoisted(() => ({ listFinanceByClient: vi.fn() }))

vi.mock("@/features/finance/server/service", () => ({ listFinanceByClient: mocks.listFinanceByClient }))

import { GET } from "@/app/api/financeiro/route"

const id = (n: number) => n.toString(16).padStart(24, "0")
const call = (query = "") => GET(new NextRequest(`http://localhost/api/financeiro${query}`), { params: Promise.resolve({}) })

beforeEach(() => {
    vi.clearAllMocks()
    mocks.listFinanceByClient.mockResolvedValue({ from: null, to: null, groups: [], totals: { taskCount: 0, serviceCount: 0, totalHours: 0, totalClientHours: 0, totalBillingBrl: 0 } })
})

describe("GET /api/financeiro", () => {
    it("encaminha período e listas normalizadas ao serviço", async () => {
        const response = await call(`?from=2026-10-01T00:00:00.000Z&clientIds=${id(1)},${id(1)},${id(2)}&projectIds=${id(3)}`)
        expect(response.status).toBe(200)
        expect(mocks.listFinanceByClient).toHaveBeenCalledWith({
            from: "2026-10-01T00:00:00.000Z",
            to: undefined,
            clientIds: [id(1), id(2)],
            projectIds: [id(3)],
            archived: false,
        })
    })

    it("encaminha o filtro de arquivados", async () => {
        const response = await call("?archived=1")
        expect(response.status).toBe(200)
        expect(mocks.listFinanceByClient).toHaveBeenCalledWith({ from: undefined, to: undefined, clientIds: [], projectIds: [], archived: true })
    })

    it("recusa identificador malformado com 400 e não consulta", async () => {
        expect((await call("?clientIds=nao-e-id")).status).toBe(400)
        expect(mocks.listFinanceByClient).not.toHaveBeenCalled()
    })

    it("sem parâmetros consulta sem filtros", async () => {
        expect((await call()).status).toBe(200)
        expect(mocks.listFinanceByClient).toHaveBeenCalledWith({ from: undefined, to: undefined, clientIds: [], projectIds: [], archived: false })
    })
})
