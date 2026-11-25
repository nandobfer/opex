import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    config: { webhookSecret: "s3gredo", defaultInstance: "opex" } as Record<string, string | undefined>,
    seen: new Set<string>(),
    forward: vi.fn(),
    patchState: vi.fn(),
    runAfter: vi.fn(),
    warn: vi.fn(),
}))

vi.mock("@/lib/after-response", () => ({ runAfterResponse: mocks.runAfter }))
vi.mock("@/features/evolution-api/server/instances", () => ({ evolutionConfig: async () => mocks.config, patchState: mocks.patchState }))
vi.mock("@/features/evolution-api/server/shared", () => ({ evolutionLog: { warn: mocks.warn, info: vi.fn(), error: vi.fn() }, publishEvolution: vi.fn() }))
vi.mock("@/features/evolution-api/server/models", () => ({
    evolutionDb: vi.fn(),
    contactKey: (instance: string, jid: string) => `${instance}:${jid}`,
    EvolutionContact: { bulkWrite: vi.fn() },
    EvolutionInstanceState: { exists: vi.fn(async () => null), findById: () => ({ lean: async () => null }) },
    EvolutionSeenEvent: {
        create: vi.fn(async ({ _id }: { _id: string }) => {
            if (mocks.seen.has(_id)) throw Object.assign(new Error("dup"), { code: 11000 })
            mocks.seen.add(_id)
        }),
    },
}))
vi.mock("@/features/secretary-agent/server/inbound", () => ({ handleIncomingMessage: mocks.forward }))

import { POST } from "@/app/api/evolution/webhook/route"
import { processEvolutionEvent } from "@/features/evolution-api/server/webhook"

const message = (id: string) => ({ event: "messages.upsert", instance: "opex", data: { key: { id, remoteJid: "5531999999999@s.whatsapp.net", fromMe: false }, message: { conversation: "oi" } } })
const request = (body: unknown, secret?: string) =>
    new Request("http://opex/api/evolution/webhook", { method: "POST", body: JSON.stringify(body), headers: secret ? { "x-opex-webhook-secret": secret } : {} }) as never

beforeEach(() => {
    mocks.seen.clear()
    vi.clearAllMocks()
})

describe("POST /api/evolution/webhook", () => {
    it("recusa sem o segredo (401) e não processa", async () => {
        expect((await POST(request(message("A")))).status).toBe(401)
        expect((await POST(request(message("A"), "errado"))).status).toBe(401)
        expect(mocks.runAfter).not.toHaveBeenCalled()
    })

    it("aceita com o segredo e responde 204 antes de processar", async () => {
        const response = await POST(request(message("A"), "s3gredo"))
        expect(response.status).toBe(204)
        expect(mocks.runAfter).toHaveBeenCalledTimes(1)
    })
})

describe("processEvolutionEvent", () => {
    it("descarta a mensagem repetida (mesmo id)", async () => {
        await processEvolutionEvent(message("DUP") as never)
        await processEvolutionEvent(message("DUP") as never)
        expect(mocks.forward).toHaveBeenCalledTimes(1)
    })

    it("ignora e loga evento de instância desconhecida", async () => {
        await processEvolutionEvent({ ...message("X"), instance: "outra" } as never)
        expect(mocks.forward).not.toHaveBeenCalled()
        expect(mocks.warn).toHaveBeenCalledWith(expect.objectContaining({ instance: "outra" }), expect.any(String))
    })

    it("não grava nem loga a chave que a Evolution manda no corpo", async () => {
        await processEvolutionEvent({ ...message("K"), apikey: "chave-global" } as never)
        expect(JSON.stringify(mocks.patchState.mock.calls)).not.toContain("chave-global")
    })
})
