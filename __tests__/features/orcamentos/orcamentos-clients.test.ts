import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    recordAudit: vi.fn(),
    publish: vi.fn(),
    clients: null as unknown,
    drafts: null as unknown,
    projects: null as unknown,
    users: null as unknown,
}))

vi.mock("@/lib/db", () => ({
    dbConnect: vi.fn(),
    recordAudit: mocks.recordAudit,
    AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR", APROVAR: "APROVAR" },
}))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: mocks.publish }))
vi.mock("@/lib/db/models/Orcamento", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.clients = memoryModel()
    mocks.drafts = memoryModel()
    return { OrcamentoClient: mocks.clients, OrcamentoDraft: mocks.drafts }
})
vi.mock("@/lib/db/models/Project", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.projects = memoryModel()
    return { Project: mocks.projects }
})
vi.mock("@/features/opex-agent/server/sessions", () => ({ deleteClientOpexData: async () => {} }))
vi.mock("@/lib/db/models/User", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.users = memoryModel()
    return { User: mocks.users }
})

import { createClient, deleteClient, getClientDto, listClients, regenerateClientToken, updateClient } from "@/features/orcamentos/server/clients"
import type { MemoryModel } from "../../helpers/memory-model"

const projects = () => mocks.projects as MemoryModel
const clients = () => mocks.clients as MemoryModel

const seedProject = async (repo = "acme/app") => {
    const doc = await projects().create({ repo, repoUrl: `https://github.com/${repo}`, name: repo, sigla: "APP", entryColumnKey: "todo", enabled: true, taskSeq: 0 })
    return String(doc._id)
}

beforeEach(() => {
    vi.clearAllMocks()
    clients().docs.length = 0
    projects().docs.length = 0
})

describe("clientes do portal", () => {
    it("cria o cliente com token, valida os repositórios e audita", async () => {
        const projectId = await seedProject()
        const created = await createClient({ name: "Acme", projectIds: [projectId], hourlyRate: 40, profitFactor: 10, active: true }, "local")
        expect(created.token.startsWith("cli_")).toBe(true)
        expect(created.item.portalPath).toBe(`/cliente?t=${encodeURIComponent(created.token)}`)
        expect(created.item).toMatchObject({ name: "Acme", hourlyRate: 40, profitFactor: 10, active: true })
        expect(created.item.projects[0]).toMatchObject({ id: projectId, repo: "acme/app" })
        expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "ClienteOrcamento", acao: "CRIAR" }))
        expect(mocks.publish).toHaveBeenCalledWith("orcamentos-updated", { scope: "clients" })
    })

    it("recusa repositório inexistente", async () => {
        await expect(createClient({ name: "X", projectIds: ["aaaaaaaaaaaaaaaaaaaaaaaa"], hourlyRate: 0, profitFactor: 1, active: true }, "local")).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" })
    })

    it("cria sem repositórios e permite vincular/desvincular depois", async () => {
        const created = await createClient({ name: "Sem repo", projectIds: [], hourlyRate: 0, profitFactor: 1, active: true }, "local")
        expect(created.token.startsWith("cli_")).toBe(true)
        expect(created.item.projectIds).toEqual([])
        expect(created.item.projects).toEqual([])
        expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "ClienteOrcamento", acao: "CRIAR", depois: expect.objectContaining({ repositorios: 0 }) }))
        expect(mocks.publish).toHaveBeenCalledWith("orcamentos-updated", { scope: "clients" })

        const projectId = await seedProject()
        const linked = await updateClient(created.item.id, { name: "Sem repo", projectIds: [projectId], hourlyRate: 10, profitFactor: 2, active: true }, "local")
        expect(linked.projectIds).toEqual([projectId])
        expect(linked.projects[0]).toMatchObject({ id: projectId, repo: "acme/app" })

        const unlinked = await updateClient(created.item.id, { name: "Sem repo", projectIds: [], hourlyRate: 10, profitFactor: 2, active: true }, "local")
        expect(unlinked.projectIds).toEqual([])
        expect(unlinked.projects).toEqual([])
    })

    it("lista, edita, regenera o token e exclui", async () => {
        const projectId = await seedProject()
        const created = await createClient({ name: "Acme", projectIds: [projectId], hourlyRate: 40, profitFactor: 10, active: true }, "local")
        expect(await listClients()).toHaveLength(1)

        const updated = await updateClient(created.item.id, { name: "Acme 2", projectIds: [projectId], hourlyRate: 50, profitFactor: 5, active: false }, "local")
        expect(updated).toMatchObject({ name: "Acme 2", hourlyRate: 50, profitFactor: 5, active: false })

        const rotated = await regenerateClientToken(created.item.id, "local")
        expect(rotated.token.startsWith("cli_")).toBe(true)
        expect(rotated.token).not.toBe(created.token)
        expect(rotated.item.portalPath).toContain(encodeURIComponent(rotated.token))
        expect(rotated.item.portalPath).not.toContain(encodeURIComponent(created.token))
        expect((await listClients())[0].portalPath).toContain(encodeURIComponent(rotated.token))

        await deleteClient(created.item.id, "local")
        expect(await listClients()).toHaveLength(0)
    })
})

describe("detalhe de um cliente (página de configuração)", () => {
    it("devolve os dados do cliente com os repositórios resolvidos", async () => {
        const projectId = await seedProject()
        const created = await createClient({ name: "Acme", projectIds: [projectId], hourlyRate: 40, profitFactor: 10, active: true }, "local")

        const detail = await getClientDto(created.item.id)
        expect(detail).toMatchObject({ id: created.item.id, name: "Acme", hourlyRate: 40, profitFactor: 10, active: true })
        expect(detail.projects[0]).toMatchObject({ id: projectId, repo: "acme/app" })
    })

    it("cliente inexistente devolve CLIENT_NOT_FOUND", async () => {
        await expect(getClientDto("aaaaaaaaaaaaaaaaaaaaaaaa")).rejects.toMatchObject({ code: "CLIENT_NOT_FOUND" })
    })
})
