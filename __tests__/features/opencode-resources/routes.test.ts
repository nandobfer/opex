import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), get: vi.fn(), toggle: vi.fn(), action: vi.fn() }))
vi.mock("@/features/opencode-resources/server/service", async (importActual) => ({
    parseResourceId: (await importActual<typeof import("@/features/opencode-resources/server/service")>()).parseResourceId,
    listResources: mocks.list,
    createResource: mocks.create,
    getResource: mocks.get,
    setResourceEnabled: mocks.toggle,
    updateResource: vi.fn(),
    deleteResource: vi.fn(),
}))
vi.mock("@/features/opencode-service/server/service", () => ({ runServiceAction: mocks.action }))

import { GET as LIST, POST as CREATE } from "@/app/api/ai/providers/opencode/resources/[kind]/route"
import { GET as DETAIL } from "@/app/api/ai/providers/opencode/resources/[kind]/[id]/route"
import { POST as TOGGLE } from "@/app/api/ai/providers/opencode/resources/[kind]/[id]/toggle/route"
import { POST as ACTION } from "@/app/api/ai/providers/opencode/service/[action]/route"
import { encodeResourceId } from "@/features/opencode-resources/ids"

const BASE = "http://localhost/api/ai/providers/opencode"
const json = (url: string, body: unknown) => new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } })

beforeEach(() => vi.clearAllMocks())

describe("rotas dos recursos e do serviço do OpenCode", () => {
    it("GET lista do tipo no escopo; tipo desconhecido = 404; escopo inválido = 400", async () => {
        mocks.list.mockResolvedValue([])
        expect((await LIST(new NextRequest(`${BASE}/resources/skill?scope=global&refresh=1`), { params: Promise.resolve({ kind: "skill" }) })).status).toBe(200)
        expect(mocks.list).toHaveBeenCalledWith("skill", "global", { refresh: true })
        expect((await LIST(new NextRequest(`${BASE}/resources/xpto`), { params: Promise.resolve({ kind: "xpto" }) })).status).toBe(404)
        expect((await LIST(new NextRequest(`${BASE}/resources/skill?scope=../etc`), { params: Promise.resolve({ kind: "skill" }) })).status).toBe(400)
    })

    it("POST valida o corpo (nome e tipo da URL) antes de criar", async () => {
        expect((await CREATE(json(`${BASE}/resources/skill`, { kind: "skill", scope: "global", name: "Nome Ruim" }), { params: Promise.resolve({ kind: "skill" }) })).status).toBe(400)
        expect((await CREATE(json(`${BASE}/resources/skill`, { kind: "agent", scope: "global", name: "a" }), { params: Promise.resolve({ kind: "skill" }) })).status).toBe(400)
        expect(mocks.create).not.toHaveBeenCalled()
        mocks.create.mockResolvedValue({ id: "x" })
        const res = await CREATE(json(`${BASE}/resources/skill`, { kind: "skill", scope: "global", name: "boa", frontmatter: { description: "d" }, body: "b" }), { params: Promise.resolve({ kind: "skill" }) })
        expect(res.status).toBe(201)
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: "boa" }), { id: "local", origin: "ui" })
    })

    it("id de outro tipo ou inválido é recusado; toggle valida o corpo", async () => {
        const agentId = encodeResourceId({ kind: "agent", scope: "global", name: "a" })
        expect((await DETAIL(new NextRequest(`${BASE}/resources/skill/${agentId}`), { params: Promise.resolve({ kind: "skill", id: agentId }) })).status).toBe(400)
        expect((await DETAIL(new NextRequest(`${BASE}/resources/skill/lixo`), { params: Promise.resolve({ kind: "skill", id: "lixo" }) })).status).toBe(400)
        expect((await TOGGLE(json(`${BASE}/resources/agent/${agentId}/toggle`, { enabled: "sim" }), { params: Promise.resolve({ kind: "agent", id: agentId }) })).status).toBe(400)
        mocks.toggle.mockResolvedValue({ id: agentId })
        expect((await TOGGLE(json(`${BASE}/resources/agent/${agentId}/toggle`, { enabled: false }), { params: Promise.resolve({ kind: "agent", id: agentId }) })).status).toBe(200)
    })

    it("ação do serviço: desconhecida = 404, versão inválida = 400", async () => {
        expect((await ACTION(json(`${BASE}/service/kill`, {}), { params: Promise.resolve({ action: "kill" }) })).status).toBe(404)
        expect((await ACTION(json(`${BASE}/service/upgrade`, { version: "latest; rm" }), { params: Promise.resolve({ action: "upgrade" }) })).status).toBe(400)
        mocks.action.mockResolvedValue({ id: "op", status: "succeeded" })
        expect((await ACTION(json(`${BASE}/service/restart`, {}), { params: Promise.resolve({ action: "restart" }) })).status).toBe(200)
        expect(mocks.action).toHaveBeenCalledWith("restart", {}, { id: "local", origin: "ui" })
    })
})
