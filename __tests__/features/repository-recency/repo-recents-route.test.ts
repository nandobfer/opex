import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * Rotas do histórico de repositórios usados recentemente: a identidade é resolvida **no servidor**
 * (dono = `local`; portal = usuário autenticado) e os repositórios permitidos vêm do contexto atual.
 */

const mocks = vi.hoisted(() => ({
    requireAdminSession: vi.fn(),
    requireClientActor: vi.fn(),
    getRepoRecents: vi.fn(),
    recordRepoRecent: vi.fn(),
    clientProjects: vi.fn(),
    projects: null as unknown,
}))

vi.mock("@/features/auth/server/context", () => ({
    requireAdminSession: mocks.requireAdminSession,
    requireClientActor: mocks.requireClientActor,
}))
vi.mock("@/features/repository-recency/server/service", () => ({
    getRepoRecents: mocks.getRepoRecents,
    recordRepoRecent: mocks.recordRepoRecent,
}))
vi.mock("@/features/orcamentos/server/clients", () => ({ clientProjects: mocks.clientProjects }))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/lib/db/models/Project", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.projects = memoryModel()
    return { Project: mocks.projects }
})

import { GET as ownerGET, POST as ownerPOST } from "@/app/api/tasks/repo-recents/route"
import { GET as clienteGET, POST as clientePOST } from "@/app/api/cliente/repo-recents/route"
import { DomainError } from "@/lib/api/route"
import type { MemoryModel } from "../../helpers/memory-model"

const projects = () => mocks.projects as MemoryModel
const json = (response: Response) => response.json() as Promise<{ success: boolean; data?: { projectIds: string[]; channel: string }; code?: string }>

/** Cadastra um repositório vinculado e devolve o seu id (usado como conjunto permitido do dono). */
async function seedProject(): Promise<string> {
    const doc = await projects().create({ repo: "acme/app", repoUrl: "https://github.com/acme/app", name: "App", sigla: "APP", entryColumnKey: "todo", enabled: true, taskSeq: 0 })
    return String(doc._id)
}

const post = (url: string, body: unknown) =>
    new NextRequest(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })

const portalProjectId = "a".repeat(24)

beforeEach(() => {
    vi.clearAllMocks()
    projects().docs.length = 0
    mocks.requireAdminSession.mockResolvedValue({ kind: "admin", iat: 0, exp: 9_999_999_999 })
    mocks.getRepoRecents.mockResolvedValue({ projectIds: [], channel: "private-repo-recents-local" })
    mocks.recordRepoRecent.mockResolvedValue({ projectIds: [portalProjectId], channel: "private-repo-recents-local" })
    mocks.clientProjects.mockResolvedValue([{ id: portalProjectId, name: "App", repo: "acme/app", sigla: "APP" }])
})

describe("GET/POST /api/tasks/repo-recents (dono)", () => {
    it("usa a identidade local e os repositórios vinculados", async () => {
        const projectId = await seedProject()

        const response = await ownerGET(new NextRequest("http://localhost/api/tasks/repo-recents"))
        expect(response.status).toBe(200)
        expect((await json(response)).data).toEqual({ projectIds: [], channel: "private-repo-recents-local" })
        expect(mocks.getRepoRecents).toHaveBeenCalledWith("local", new Set([projectId]))
    })

    it("registra o uso com a identidade local", async () => {
        const projectId = await seedProject()

        const response = await ownerPOST(post("http://localhost/api/tasks/repo-recents", { projectId }))
        expect(response.status).toBe(200)
        expect(mocks.recordRepoRecent).toHaveBeenCalledWith("local", projectId, new Set([projectId]))
    })

    it("recusa corpo inválido sem chamar o serviço", async () => {
        const response = await ownerPOST(post("http://localhost/api/tasks/repo-recents", { projectId: "não-é-id" }))
        expect(response.status).toBe(400)
        expect((await json(response)).code).toBe("VALIDATION_ERROR")
        expect(mocks.recordRepoRecent).not.toHaveBeenCalled()
    })

    it("sem sessão do dono, responde 401 e não consulta o serviço", async () => {
        mocks.requireAdminSession.mockRejectedValue(new DomainError(401, "Sessão ausente ou expirada.", "UNAUTHENTICATED"))
        const response = await ownerGET(new NextRequest("http://localhost/api/tasks/repo-recents"))
        expect(response.status).toBe(401)
        expect(mocks.getRepoRecents).not.toHaveBeenCalled()
    })
})

describe("GET/POST /api/cliente/repo-recents (portal)", () => {
    beforeEach(() => {
        mocks.requireClientActor.mockResolvedValue({ userId: "u1", client: {}, preview: false })
        mocks.getRepoRecents.mockResolvedValue({ projectIds: [portalProjectId], channel: "private-repo-recents-u1" })
        mocks.recordRepoRecent.mockResolvedValue({ projectIds: [portalProjectId], channel: "private-repo-recents-u1" })
    })

    it("usa a identidade do usuário e só os repositórios do cliente em escopo", async () => {
        const response = await clienteGET(new NextRequest("http://localhost/api/cliente/repo-recents"))
        expect(response.status).toBe(200)
        expect(mocks.getRepoRecents).toHaveBeenCalledWith("u1", new Set([portalProjectId]))
    })

    it("registra o uso do repositório permitido ao cliente", async () => {
        const response = await clientePOST(post("http://localhost/api/cliente/repo-recents", { projectId: portalProjectId }))
        expect(response.status).toBe(200)
        expect(mocks.recordRepoRecent).toHaveBeenCalledWith("u1", portalProjectId, new Set([portalProjectId]))
    })

    it("propaga a recusa do serviço para repositório fora do escopo", async () => {
        mocks.recordRepoRecent.mockRejectedValue(new DomainError(400, "Repositório não disponível", "PROJECT_NOT_ALLOWED"))
        const response = await clientePOST(post("http://localhost/api/cliente/repo-recents", { projectId: portalProjectId }))
        expect(response.status).toBe(400)
        expect((await json(response)).code).toBe("PROJECT_NOT_ALLOWED")
    })
})
