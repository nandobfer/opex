import { NextRequest } from "next/server"
import { expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ contacts: vi.fn(), lean: vi.fn() }))
vi.mock("@/features/auth/server/context", () => ({ requireAdminSession: vi.fn() }))
vi.mock("@/features/evolution-api/server/contacts", () => ({ contactsByJid: mocks.contacts }))
vi.mock("@/features/secretary-agent/server/models", () => ({
    secretaryDb: vi.fn(),
    SecretaryNotice: { find: () => {
        const query = { select: () => query, sort: () => query, limit: () => query, lean: mocks.lean }
        return query
    } },
}))

import { GET } from "@/app/api/secretary/notices/route"

it("devolve trecho, autor e contato da instância sem expor a mensagem original", async () => {
    const jid = "123@g.us"
    const contact = { jid, name: "Família", pictureUrl: "https://example.test/foto.jpg", isGroup: true }
    mocks.lean.mockResolvedValueOnce([{ _id: "a", instance: "whatsapp", jid, status: "pending", excerpt: "[áudio] Sábado?", author: "João", trigger: { text: "texto integral" } }]).mockResolvedValueOnce([])
    mocks.contacts.mockResolvedValueOnce(new Map([[jid, contact]]))
    const response = await GET(new NextRequest("http://localhost/api/secretary/notices"), { params: Promise.resolve({}) })
    expect(response.status).toBe(200)
    expect(mocks.contacts).toHaveBeenCalledWith([jid], "whatsapp")
    const { data } = await response.json()
    expect(data).toMatchObject({ pending: 1, items: [{ contact, author: "João", excerpt: "[áudio] Sábado?" }] })
    expect(data.items[0]).not.toHaveProperty("trigger")
})
