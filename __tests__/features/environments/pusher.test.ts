import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ session: vi.fn(), client: vi.fn(), admin: vi.fn(), authorize: vi.fn() }))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }))
vi.mock("@/lib/pusher/server", () => ({ getPusherServer: async () => ({ authorizeChannel: mocks.authorize }) }))
vi.mock("@/features/auth/server/context", () => ({
    sessionFromRequest: mocks.session,
    requireClientActor: mocks.client,
    requireAdminSession: mocks.admin,
}))
vi.mock("@/lib/db/models/Environment", async () => ({ Environment: (await import("./fixtures")).store.env }))
import { POST } from "@/app/api/pusher/auth/route"
import { DomainError } from "@/lib/api/route"
import { resetStore, repoId, envId } from "./fixtures"
const req = (channel = `private-environment-${envId}`) =>
    new NextRequest("http://localhost/api/pusher/auth", {
        method: "POST",
        body: new URLSearchParams({ socket_id: "1.2", channel_name: channel }),
    })
beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    mocks.session.mockResolvedValue({ kind: "client", userId: "u", clientId: "c" })
    mocks.client.mockResolvedValue({ userId: "u", client: { _id: "c", projectIds: [repoId] }, isAdmin: false })
    mocks.authorize.mockReturnValue({ auth: "authorized" })
})
describe("canal privado de Ambientes", () => {
    it("cliente vinculado recebe autorização após revalidação do ator", async () => {
        expect((await POST(req())).status).toBe(200)
        expect(mocks.client).toHaveBeenCalled()
        expect(mocks.authorize).toHaveBeenCalledWith("1.2", `private-environment-${envId}`)
    })
    it("repositório alheio e vínculo revogado negam sem resposta 500", async () => {
        mocks.client.mockResolvedValueOnce({ userId: "u", client: { _id: "c", projectIds: [] }, isAdmin: false })
        expect((await POST(req())).status).toBe(403)
        mocks.client.mockRejectedValueOnce(new DomainError(403, "Vínculo revogado"))
        expect((await POST(req())).status).toBe(403)
        expect(mocks.authorize).not.toHaveBeenCalled()
    })
    it("portal não assina canal geral da IA; identificador inválido é recusado", async () => {
        expect((await POST(req("private-integration-ai"))).status).toBe(403)
        expect((await POST(req("private-environment-invalido"))).status).toBe(403)
        expect(mocks.authorize).not.toHaveBeenCalled()
    })
})
