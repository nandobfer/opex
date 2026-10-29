import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ list: vi.fn(), connectWithKey: vi.fn(), activate: vi.fn() }))
vi.mock("@/features/opencode-accounts/server/service", () => ({ listAuthProviders: mocks.list, connectWithKey: mocks.connectWithKey, activateAccount: mocks.activate }))

import { GET } from "@/app/api/ai/providers/opencode/accounts/route"
import { POST as POST_KEY } from "@/app/api/ai/providers/opencode/accounts/[integrationId]/key/route"
import { POST as ACTIVATE } from "@/app/api/ai/providers/opencode/accounts/credentials/[credentialId]/activate/route"
import { DomainError } from "@/lib/api/route"

const BASE = "http://localhost/api/ai/providers/opencode/accounts"
const postKey = (body: unknown) =>
    POST_KEY(new NextRequest(`${BASE}/anthropic/key`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ integrationId: "anthropic" }) })

beforeEach(() => vi.clearAllMocks())

describe("rotas das contas do OpenCode", () => {
    it("GET lista os providers", async () => {
        mocks.list.mockResolvedValue([{ id: "anthropic" }])
        const res = await GET(new NextRequest(BASE), { params: Promise.resolve({}) })
        expect(res.status).toBe(200)
        expect((await res.json()).data).toEqual([{ id: "anthropic" }])
    })

    it("POST da chave valida o corpo e não devolve a chave", async () => {
        expect((await postKey({ key: "" })).status).toBe(400)
        expect(mocks.connectWithKey).not.toHaveBeenCalled()
        const res = await postKey({ key: "sk-SEGREDO", label: "Pessoal" })
        expect(res.status).toBe(200)
        expect(mocks.connectWithKey).toHaveBeenCalledWith("anthropic", { key: "sk-SEGREDO", label: "Pessoal" })
        expect(JSON.stringify(await res.json())).not.toContain("sk-SEGREDO")
    })

    it("erro de regra vira a resposta padronizada", async () => {
        mocks.activate.mockRejectedValue(new DomainError(404, "Conta não encontrada no OpenCode", "OPENCODE_ACCOUNT_NOT_FOUND"))
        const res = await ACTIVATE(new NextRequest(`${BASE}/credentials/c1/activate`, { method: "POST" }), { params: Promise.resolve({ credentialId: "c1" }) })
        expect(res.status).toBe(404)
        expect((await res.json()).code).toBe("OPENCODE_ACCOUNT_NOT_FOUND")
    })
})
