import { legacyRoute } from '../../helpers/integrations-route'
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ usage: vi.fn() }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/features/ai/server/provider-usage", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({ getProviderUsage: mocks.usage }))(importOriginal)) as Record<string, unknown>), }))

const { GET } = legacyRoute("ai", "providers/[provider]/usage")

const call = (provider: string, query = "") =>
    GET(new NextRequest(`http://localhost/api/ai/providers/${provider}/usage${query}`), { params: Promise.resolve({ provider }) })

beforeEach(() => vi.clearAllMocks())

describe("GET /api/ai/providers/[provider]/usage", () => {
    it("retorna o consumo do provedor direto em ApiResponse, com períodos ISO opcionais", async () => {
        mocks.usage.mockResolvedValue({ rows: [], total: { requests: 0, inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null } })
        const response = await call("gemini", "?from=2026-10-10T00:00:00.000Z&to=2026-10-11T23:59:59.999Z")
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ success: true, data: { rows: [] } })
        expect(mocks.usage).toHaveBeenCalledWith("gemini", { from: "2026-10-10T00:00:00.000Z", to: "2026-10-11T23:59:59.999Z" })
    })

    it("provedor desconhecido não consulta o banco (OpenCode e JEV têm o próprio painel em providers/<id>/usage)", async () => {
        for (const provider of ["desconhecido", "gemini-x"]) expect((await call(provider)).status).toBe(404)
        expect(mocks.usage).not.toHaveBeenCalled()
    })

    it("data inválida ou intervalo invertido não consulta o banco", async () => {
        expect((await call("anthropic", "?from=erro")).status).toBe(400)
        expect((await call("openai", "?from=2026-10-12T00:00:00Z&to=2026-10-10T00:00:00Z")).status).toBe(400)
        expect(mocks.usage).not.toHaveBeenCalled()
    })

    it("aceita o filtro de chave (id, none ou removed) e recusa valor inválido (OPE-155)", async () => {
        mocks.usage.mockResolvedValue({ rows: [], total: {} })
        expect((await call("gemini", "?apiKey=key_aaaaaaaaaaaaaaaaaa")).status).toBe(200)
        expect(mocks.usage).toHaveBeenLastCalledWith("gemini", { apiKey: "key_aaaaaaaaaaaaaaaaaa" })
        expect((await call("gemini", "?apiKey=none")).status).toBe(200)
        expect((await call("gemini", "?apiKey=chave-qualquer")).status).toBe(400)
        expect(mocks.usage).toHaveBeenCalledTimes(2)
    })
})
