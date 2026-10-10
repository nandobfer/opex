import { beforeEach, describe, expect, it, vi } from "vitest"
import { createHash } from "node:crypto"

const mocks = vi.hoisted(() => ({ clients: null as unknown, drafts: null as unknown }))

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/lib/db/models/Orcamento", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.clients = memoryModel()
    mocks.drafts = memoryModel()
    return { OrcamentoClient: mocks.clients, OrcamentoDraft: mocks.drafts }
})

import { CLIENT_TOKEN_PREFIX } from "@/features/orcamentos/constants"
import { findClientByToken, hashClientToken, newClientTokenValue, requireClient } from "@/features/orcamentos/server/token"
import type { MemoryModel } from "../../helpers/memory-model"

const clients = () => mocks.clients as MemoryModel

beforeEach(() => {
    vi.clearAllMocks()
    clients().docs.length = 0
})

describe("token do portal do cliente", () => {
    it("gera um valor `cli_…` com prefixo visível e hash SHA-256", () => {
        const { token, prefix, hash } = newClientTokenValue()
        expect(token.startsWith(CLIENT_TOKEN_PREFIX)).toBe(true)
        expect(prefix).toBe(token.slice(0, CLIENT_TOKEN_PREFIX.length + 8))
        expect(hash).toBe(createHash("sha256").update(token).digest("hex"))
    })

    it("autentica pelo header x-client-token e pela query ?t=", async () => {
        const token = "cli_testtoken"
        await clients().create({ name: "Acme", tokenHash: hashClientToken(token), tokenPrefix: "cli_test", projectIds: [], hourlyRate: 0, profitFactor: 1, active: true })

        const viaHeader = await requireClient(new Request("http://localhost/api/cliente/tasks", { headers: { "x-client-token": token } }))
        expect(viaHeader.name).toBe("Acme")

        const viaQuery = await findClientByToken(token)
        expect(viaQuery?.name).toBe("Acme")
    })

    it("recusa token ausente, desconhecido ou desativado", async () => {
        await clients().create({ name: "Off", tokenHash: hashClientToken("cli_off"), tokenPrefix: "cli_off", projectIds: [], hourlyRate: 0, profitFactor: 1, active: false })
        await expect(requireClient(new Request("http://localhost/api/cliente/tasks"))).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
        await expect(requireClient(new Request("http://localhost/api/cliente/tasks?t=cli_inexistente"))).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
        await expect(requireClient(new Request("http://localhost/api/cliente/tasks?t=cli_off"))).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    })
})
