import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * Rota de detalhe do cliente (página de configuração do dono). Guarda contra a regressão que
 * derrubava `/integracoes/clientes/[clientId]` com **405**: a rota só tinha PATCH e DELETE.
 */

const mocks = vi.hoisted(() => ({
    getClientDto: vi.fn(),
    updateClient: vi.fn(),
    deleteClient: vi.fn(),
}))

vi.mock("@/features/orcamentos/server/clients", () => ({
    getClientDto: mocks.getClientDto,
    updateClient: mocks.updateClient,
    deleteClient: mocks.deleteClient,
}))

import { DELETE, GET, PATCH } from "@/app/api/integrations/orcamentos/clients/[id]/route"
import { DomainError } from "@/lib/api/route"
import { createSessionToken } from "@/features/auth/session"

const SECRET = "segredo-de-teste"
const clientId = "6ac9de756cb7e9ca4a4528ac"
const otherId = "aaaaaaaaaaaaaaaaaaaaaaaa"

const call = (id: string, cookie?: string) =>
    GET(
        new NextRequest(`http://localhost/api/integrations/orcamentos/clients/${id}`, cookie ? { headers: { cookie } } : undefined),
        { params: Promise.resolve({ id }) },
    )

const adminCookie = async () => `opex_session=${await createSessionToken(SECRET, { kind: "admin" })}`
const clientCookie = async () => `opex_session=${await createSessionToken(SECRET, { kind: "client", userId: "000000000000000000000001" })}`

beforeEach(() => {
    vi.clearAllMocks()
    process.env.AUTH_SECRET = SECRET
    mocks.getClientDto.mockResolvedValue({
        id: clientId,
        name: "Acme",
        hourlyRate: 40,
        profitFactor: 10,
        active: true,
        tokenPrefix: "cli_abc",
        projects: [],
        portalPath: "/cliente?t=cli_x",
    })
})

describe("GET /api/integrations/orcamentos/clients/[id]", () => {
    it("devolve o cliente (200) para a sessão do dono", async () => {
        const response = await call(clientId, await adminCookie())
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.success).toBe(true)
        expect(body.data).toMatchObject({ id: clientId, name: "Acme" })
        expect(mocks.getClientDto).toHaveBeenCalledWith(clientId)
    })

    it("cliente inexistente devolve 404 (e não 405)", async () => {
        mocks.getClientDto.mockRejectedValue(new DomainError(404, "Cliente não encontrado", "CLIENT_NOT_FOUND"))
        const response = await call(otherId, await adminCookie())
        expect(response.status).toBe(404)
        expect((await response.json()).code).toBe("CLIENT_NOT_FOUND")
    })

    it("sem sessão devolve 401 e não consulta o serviço", async () => {
        const response = await call(clientId)
        expect(response.status).toBe(401)
        expect(mocks.getClientDto).not.toHaveBeenCalled()
    })

    it("sessão de usuário de cliente é recusada com 403 e não consulta o serviço", async () => {
        const response = await call(clientId, await clientCookie())
        expect(response.status).toBe(403)
        expect(mocks.getClientDto).not.toHaveBeenCalled()
    })

    it("mantém PATCH e DELETE exportados", () => {
        expect(typeof PATCH).toBe("function")
        expect(typeof DELETE).toBe("function")
    })
})
