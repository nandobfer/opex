import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ load: vi.fn(), write: vi.fn() }))
vi.mock("@/features/auth/server/context", () => ({ requireAdminSession: vi.fn() }))
vi.mock("@/features/secretary-agent/server/personality", () => ({ loadPersonality: mocks.load, writeVersion: mocks.write }))

import { DELETE, PUT } from "@/app/api/secretary/personality/variants/[id]/route"

const variant = { jid: "5531999999999@s.whatsapp.net", title: "Ana", blocks: [], origin: "analysis" }
const other = { ...variant, jid: "120363000000000001@g.us" }
const snapshot = { base: { blocks: [] }, variants: [variant, other] }
const request = (method: string, body?: object) => new NextRequest("http://localhost/api/secretary/personality/variants/test", { method, body: body && JSON.stringify(body) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
    vi.clearAllMocks()
    mocks.load.mockResolvedValue({ versionId: "v1", snapshot })
    mocks.write.mockResolvedValue("v2")
})

describe("rota de variantes", () => {
    it.each([variant.jid, encodeURIComponent(variant.jid)])("exclui apenas a variante %s", async (id) => {
        expect((await DELETE(request("DELETE"), params(id))).status).toBe(200)
        expect(mocks.write).toHaveBeenCalledWith({ ...snapshot, variants: [other] }, "edit", "local", "v1")
    })

    it("move a variante sem deixar o JID antigo para trás", async () => {
        const body = { jid: "777@lid", title: "Editada", blocks: [] }
        expect((await PUT(request("PUT", body), params(encodeURIComponent(variant.jid)))).status).toBe(200)
        expect(mocks.write).toHaveBeenCalledWith({ ...snapshot, variants: [other, { ...body, origin: "owner" }] }, "edit", "local", "v1")
    })

    it("rejeita segmento inválido nos dois métodos e não grava versão para variante ausente", async () => {
        expect((await DELETE(request("DELETE"), params("%ZZ"))).status).toBe(400)
        expect((await PUT(request("PUT", variant), params("invalido"))).status).toBe(400)
        expect((await DELETE(request("DELETE"), params("777@lid"))).status).toBe(404)
        expect(mocks.write).not.toHaveBeenCalled()
    })
})
