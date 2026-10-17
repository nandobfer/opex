import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn() }))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/features/auth/server/context", () => ({
    requireAdminSession: mocks.admin,
    requireClientActor: mocks.client,
}))
vi.mock("@/lib/db/models/Project", async () => ({ Project: (await import("./fixtures")).store.project }))
import { environmentActor, listRepos, accessibleProject, assertEdit } from "@/features/environments/server/access"
import { resetStore, repoId, store } from "./fixtures"

beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
})
describe("autorização revalidada por requisição", () => {
    const req = new NextRequest("http://localhost/api/environments")
    it("dono usa usuário local, sem cargos no app interno", async () => {
        const actor = await environmentActor(req)
        expect(mocks.admin).toHaveBeenCalledWith(req)
        expect(actor).toMatchObject({ userId: "local", canEdit: true, owner: true, projectIds: null })
        expect(await listRepos(actor)).toHaveLength(1)
    })
    it("usuário comum só acessa repositórios vinculados, mas não pode configurar", async () => {
        mocks.client.mockResolvedValue({
            userId: "user",
            client: { _id: "client", projectIds: [repoId] },
            isAdmin: false,
            preview: false,
        })
        const actor = await environmentActor(req, true)
        expect(await accessibleProject(actor, repoId)).toMatchObject({ repo: "org/app" })
        expect(() => assertEdit(actor)).toThrow("Apenas o dono")
        await expect(accessibleProject(actor, "eeeeeeeeeeeeeeeeeeeeeeee")).rejects.toMatchObject({ status: 404 })
    })
    it("admin do cliente não é dono e perde acesso imediatamente ao perder vínculo", async () => {
        mocks.client.mockResolvedValueOnce({
            userId: "user",
            client: { _id: "client", projectIds: [repoId] },
            isAdmin: true,
            preview: false,
        })
        expect(await environmentActor(req, true)).toMatchObject({ canEdit: true, owner: false })
        mocks.client.mockRejectedValueOnce(new Error("Vínculo removido"))
        await expect(environmentActor(req, true)).rejects.toThrow("Vínculo removido")
        expect(mocks.client).toHaveBeenCalledTimes(2)
    })
    it("não lista nem revela repositório de outro cliente ou id inválido", async () => {
        store.project.docs.push({ _id: "eeeeeeeeeeeeeeeeeeeeeeee", repo: "org/privado", name: "Privado" })
        mocks.client.mockResolvedValue({ userId: "u", client: { _id: "c", projectIds: [repoId] }, isAdmin: true })
        const actor = await environmentActor(req, true)
        expect(await listRepos(actor)).toEqual([{ id: repoId, repo: "org/app", name: "App" }])
        await expect(accessibleProject(actor, "inválido")).rejects.toMatchObject({ status: 400 })
    })
})
