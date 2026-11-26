import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Teste da integração: o alcance é conferido pelo `fetchInstances` (rota local da Evolution). O `GET /` da 2.3.8
 * consulta o WhatsApp Web a cada chamada e pode travar com a Evolution no ar, então só informa a versão.
 */

const mocks = vi.hoisted(() => ({
    info: vi.fn(),
    fetchInstances: vi.fn(),
    findWebhook: vi.fn(),
}))

vi.mock("@/lib/integrations/config", () => ({
    getIntegrationConfig: async () => ({ internalUrl: "http://evolution-api:8080", apiKey: "CHAVE", defaultInstance: "fernando-opex", webhookUrl: "http://opex:7000/api/evolution/webhook" }),
}))
vi.mock("@/features/evolution-api/server/client", () => ({
    evolution: { info: mocks.info, fetchInstances: mocks.fetchInstances, findWebhook: mocks.findWebhook },
    EvolutionError: class EvolutionError extends Error {
        constructor(message: string, readonly status: number | null, readonly code: string) {
            super(message)
        }
    },
}))

import { testEvolution, VERSION_TIMEOUT_MS } from "@/features/evolution-api/server/tester"

const run = () => testEvolution({ emit: vi.fn(), signal: new AbortController().signal } as unknown as Parameters<typeof testEvolution>[0])

beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchInstances.mockResolvedValue([{ name: "fernando-opex", connectionStatus: "open" }])
    mocks.findWebhook.mockResolvedValue({ enabled: true, url: "http://opex:7000/api/evolution/webhook" })
    mocks.info.mockResolvedValue({ version: "2.3.8" })
})

describe("teste da Evolution API", () => {
    it("passa com a versão quando o GET / responde", async () => {
        expect(await run()).toBe("Evolution API 2.3.8, chave válida e instância conectada")
        expect(mocks.info).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: VERSION_TIMEOUT_MS }))
    })

    it("regressão: GET / travado não reprova o teste, que confere o alcance pelo fetchInstances", async () => {
        mocks.info.mockRejectedValue(new Error("Evolution API fora do alcance. Confira a URL e tente novamente."))
        expect(await run()).toBe("Evolution API no ar, chave válida e instância conectada")
        expect(mocks.fetchInstances).toHaveBeenCalled()
    })

    it("reprova quando a rota local também não responde", async () => {
        mocks.fetchInstances.mockRejectedValue(new Error("Evolution API fora do alcance. Confira a URL e tente novamente."))
        await expect(run()).rejects.toThrow("fora do alcance")
        expect(mocks.info).not.toHaveBeenCalled()
    })
})
