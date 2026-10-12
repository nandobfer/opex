import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ users: null as unknown, clients: null as unknown, audit: vi.fn(), publish: vi.fn() }))

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(), recordAudit: mocks.audit, AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: mocks.publish }))
vi.mock("@/features/auth/server/password", () => ({ hashPassword: vi.fn(async (password: string) => `scrypt$mock$${password}`) }))
vi.mock("@/lib/db/models/User", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.users = memoryModel()
    return { User: mocks.users }
})
vi.mock("@/lib/db/models/Orcamento", async () => {
    const { memoryModel } = await import("../../helpers/memory-model")
    mocks.clients = memoryModel()
    return { OrcamentoClient: mocks.clients }
})

import { fakeId, type Doc, type MemoryModel } from "../../helpers/memory-model"
import { clienteLoginPath } from "@/features/orcamentos/constants"
import { createClientUser, deleteClientUser, ensureDefaultUser, listClientUsers, regenerateClientUserToken, removeClientUsers, updateClientUser } from "@/features/orcamentos/server/users"
import type { ClienteOrcamentoDoc } from "@/features/orcamentos/server/token"

const users = () => mocks.users as MemoryModel
const clients = () => mocks.clients as MemoryModel

const CLIENT_ID = fakeId()
const OTHER_CLIENT_ID = fakeId()

const client = { _id: CLIENT_ID, name: "Acme Corp", token: "cli_acme", tokenPrefix: "cli_acme", projectIds: [], hourlyRate: 100, profitFactor: 2, active: true } as unknown as ClienteOrcamentoDoc

function seedClients(): void {
    clients().docs.push({ _id: CLIENT_ID, name: "Acme Corp" }, { _id: OTHER_CLIENT_ID, name: "Outro Cliente" })
}

function seedUser(overrides: Doc): Doc {
    const doc: Doc = { _id: fakeId(), username: `user-${users().docs.length}`, email: null, passwordHash: null, memberships: [], token: null, tokenHash: null, tokenPrefix: null, defaultForClientId: null, active: true, ...overrides }
    users().docs.push(doc)
    return doc
}

beforeEach(() => {
    vi.clearAllMocks()
    users().docs.length = 0
    clients().docs.length = 0
    seedClients()
})

describe("usuário padrão do cliente", () => {
    it("cria o padrão com slug do nome, admin, sem email/senha e sem token próprio", async () => {
        await ensureDefaultUser(client)
        expect(users().docs).toHaveLength(1)
        expect(users().docs[0]).toMatchObject({ username: "acme-corp", email: null, passwordHash: null, defaultForClientId: CLIENT_ID, active: true, token: null })
        expect((users().docs[0]!.memberships as unknown[])[0]).toEqual({ clientId: CLIENT_ID, admin: true })
    })

    it("é idempotente", async () => {
        await ensureDefaultUser(client)
        await ensureDefaultUser(client)
        expect(users().docs).toHaveLength(1)
    })

    it("desempata o username em colisão com sufixo alfabético curto", async () => {
        seedUser({ username: "acme-corp" })
        await ensureDefaultUser(client)
        const created = users().docs.find((doc) => doc.defaultForClientId === CLIENT_ID)!
        expect(/^acme-corp-[a-z]{4}$/.test(created.username as string)).toBe(true)
    })

    it("entra pela URL do cliente (token do cliente)", async () => {
        await ensureDefaultUser(client)
        const list = await listClientUsers(client)
        expect(list).toHaveLength(1)
        expect(list[0]!.isDefault).toBe(true)
        expect(list[0]!.portalPath).toBe(clienteLoginPath("cli_acme"))
    })
})

describe("criar usuário", () => {
    it("cria com token próprio e devolve a URL de login individual", async () => {
        const created = await createClientUser(client, { username: "ana", email: "ana@exemplo.com", password: "123", admin: false }, "owner")
        expect(created.token?.startsWith("usr_")).toBe(true)
        expect(created.item).toMatchObject({ username: "ana", email: "ana@exemplo.com", admin: false, isDefault: false, portalPath: clienteLoginPath(created.token!) })
    })

    it("recusa email duplicado (global) com erro pt-BR", async () => {
        await createClientUser(client, { username: "ana", email: "dup@exemplo.com", admin: false }, "owner")
        await expect(createClientUser(client, { username: "bia", email: "dup@exemplo.com", admin: false }, "owner")).rejects.toMatchObject({ code: "EMAIL_IN_USE" })
    })

    it("recusa username duplicado", async () => {
        await createClientUser(client, { username: "ana", admin: false }, "owner")
        await expect(createClientUser(client, { username: "ana", admin: false }, "owner")).rejects.toMatchObject({ code: "USERNAME_IN_USE" })
    })

    it("normaliza email vazio para null (entra só por URL)", async () => {
        const created = await createClientUser(client, { username: "bia", email: "", admin: true }, "owner")
        expect(created.item.email).toBeNull()
        expect(created.item.admin).toBe(true)
    })
})

describe("permissões de gestão", () => {
    it("o admin do cliente não altera um usuário compartilhado com outro cliente", async () => {
        const shared = seedUser({ memberships: [{ clientId: CLIENT_ID, admin: false }, { clientId: OTHER_CLIENT_ID, admin: true }] })
        await expect(updateClientUser(client, String(shared._id), { username: "novo", admin: false }, "cliente-admin", { owner: false })).rejects.toMatchObject({ code: "SHARED_USER" })
        // O dono pode.
        const updated = await updateClientUser(client, String(shared._id), { username: "novo", admin: false }, "owner", { owner: true })
        expect(updated.username).toBe("novo")
    })

    it("o padrão do cliente não pode ser excluído", async () => {
        await ensureDefaultUser(client)
        const standard = users().docs[0]!
        await expect(deleteClientUser(client, String(standard._id), "owner", { owner: true })).rejects.toMatchObject({ code: "DEFAULT_USER" })
    })

    it("excluir um vínculo mantém o usuário se ele estiver em outro cliente", async () => {
        const shared = seedUser({ memberships: [{ clientId: CLIENT_ID, admin: false }, { clientId: OTHER_CLIENT_ID, admin: false }] })
        await deleteClientUser(client, String(shared._id), "owner", { owner: true })
        expect(users().docs).toHaveLength(1)
        expect((users().docs[0]!.memberships as Array<{ clientId: string }>)).toEqual([{ clientId: OTHER_CLIENT_ID, admin: false }])
    })

    it("excluir o último vínculo apaga o usuário", async () => {
        const solo = seedUser({ memberships: [{ clientId: CLIENT_ID, admin: false }] })
        await deleteClientUser(client, String(solo._id), "owner", { owner: true })
        expect(users().docs).toHaveLength(0)
    })

    it("regenerar o token do padrão é recusado (usa o token do cliente)", async () => {
        await ensureDefaultUser(client)
        const standard = users().docs[0]!
        await expect(regenerateClientUserToken(client, String(standard._id), "owner", { owner: true })).rejects.toMatchObject({ code: "DEFAULT_USER_TOKEN" })
    })

    it("regenerar o token troca o valor e mantém o usuário utilizável", async () => {
        const created = await createClientUser(client, { username: "ana", admin: false }, "owner")
        const regenerated = await regenerateClientUserToken(client, created.item.id, "owner", { owner: true })
        expect(regenerated.token).not.toBe(created.token)
        expect(regenerated.item.portalPath).toBe(clienteLoginPath(regenerated.token!))
    })

    it("excluir um cliente remove os vínculos e apaga órfãos (inclusive o padrão)", async () => {
        await ensureDefaultUser(client)
        const shared = seedUser({ memberships: [{ clientId: CLIENT_ID, admin: false }, { clientId: OTHER_CLIENT_ID, admin: false }] })
        await removeClientUsers(CLIENT_ID)
        expect(users().docs).toHaveLength(1)
        expect(String(users().docs[0]!._id)).toBe(String(shared._id))
    })
})
