import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CredentialEntry } from "@opencode/client"

const mocks = vi.hoisted(() => ({
    client: {
        integration: {
            list: vi.fn(),
            get: vi.fn(),
            connect: { key: vi.fn() },
            oauth: { connect: vi.fn(), status: vi.fn(), complete: vi.fn(), cancel: vi.fn() },
            command: { connect: vi.fn(), status: vi.fn(), cancel: vi.fn() },
        },
        credential: { list: vi.fn(), activate: vi.fn(), update: vi.fn(), remove: vi.fn() },
        provider: { list: vi.fn() },
    },
    audit: vi.fn(),
    publish: vi.fn(),
    clearCache: vi.fn(),
    connection: vi.fn(),
}))

vi.mock("@/lib/ai/opencode", () => ({ getOpencodeConnection: mocks.connection }))
vi.mock("@/lib/ai/opencode-client", () => ({ getOpencodeClient: vi.fn(async () => mocks.client) }))
vi.mock("@/lib/audit/record", () => ({ recordAudit: mocks.audit, AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: mocks.publish }))
vi.mock("@/lib/ai/catalog", () => ({ clearAiCatalogCache: mocks.clearCache }))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined) }))

import { DomainError } from "@/lib/api/route"
import { OPENCODE_ACCOUNTS_UPDATED_EVENT } from "@/features/opencode-accounts/constants"
import { activateAccount, connectWithKey, listAuthProviders, oauthStatus, removeAccount, startOauth, toDomainError } from "@/features/opencode-accounts/server/service"

const KEY = "sk-ant-NAO-PODE-VAZAR"
const anthropic = { id: "anthropic", name: "Anthropic", methods: [{ type: "key" }, { id: "claude-max", type: "oauth", label: "Claude Pro/Max" }, { id: "device", type: "oauth", label: "Dispositivo" }], connections: [] }
const existing: CredentialEntry = { id: "cred_old", integrationID: "anthropic", label: "Antiga", active: true, value: { type: "key", key: "sk-OLD" } }
const created: CredentialEntry = { id: "cred_new", integrationID: "anthropic", label: "Nova", active: false, value: { type: "key", key: KEY } }

beforeEach(() => {
    vi.clearAllMocks()
    mocks.connection.mockResolvedValue({ baseUrl: "http://oc", headers: {}, directory: "/repo" })
    mocks.client.integration.get.mockResolvedValue({ data: anthropic })
    mocks.client.integration.list.mockResolvedValue({ data: [anthropic] })
    mocks.client.provider.list.mockResolvedValue({ data: [] })
    mocks.client.credential.list.mockResolvedValue([existing])
})

describe("listAuthProviders", () => {
    it("consulta no diretório configurado e não devolve o valor das credenciais", async () => {
        const rows = await listAuthProviders()
        expect(mocks.client.integration.list).toHaveBeenCalledWith({ location: { directory: "/repo" } })
        expect(rows[0]).toMatchObject({ id: "anthropic", activeAccountId: "cred_old" })
        expect(JSON.stringify(rows)).not.toContain("sk-OLD")
    })
})

describe("connectWithKey", () => {
    it("adiciona a conta, seleciona a nova e audita sem a chave", async () => {
        mocks.client.credential.list.mockResolvedValueOnce([existing]).mockResolvedValueOnce([existing, created])
        await connectWithKey("anthropic", { key: KEY, label: "Nova" })
        expect(mocks.client.integration.connect.key).toHaveBeenCalledWith({ integrationID: "anthropic", location: { directory: "/repo" }, key: KEY, label: "Nova", answer: undefined })
        expect(mocks.client.credential.activate).toHaveBeenCalledWith({ credentialID: "cred_new" })
        expect(mocks.audit).toHaveBeenCalledOnce()
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(KEY)
        expect(mocks.clearCache).toHaveBeenCalled()
        expect(mocks.publish).toHaveBeenCalledWith(OPENCODE_ACCOUNTS_UPDATED_EVENT, { integrationId: "anthropic" })
    })

    it("recusa provider sem login por chave", async () => {
        mocks.client.integration.get.mockResolvedValue({ data: { ...anthropic, methods: [{ id: "x", type: "oauth", label: "X" }] } })
        await expect(connectWithKey("anthropic", { key: KEY })).rejects.toMatchObject({ status: 409 })
        expect(mocks.client.integration.connect.key).not.toHaveBeenCalled()
    })
})

describe("startOauth", () => {
    const attempt = (mode: "auto" | "code", url: string) => ({ data: { attemptID: "att_1", url, instructions: "Enter code: AB-12", mode, time: { created: 1, expires: 2 } } })

    it("devolve a tentativa do modo código", async () => {
        mocks.client.integration.oauth.connect.mockResolvedValue(attempt("code", "https://claude.ai/oauth/authorize?redirect_uri=https%3A%2F%2Fconsole.anthropic.com%2Fcallback"))
        await expect(startOauth("anthropic", { methodId: "claude-max" })).resolves.toMatchObject({ attemptId: "att_1", mode: "code" })
        expect(mocks.client.integration.oauth.cancel).not.toHaveBeenCalled()
    })

    it("libera o modo automático de código de dispositivo", async () => {
        mocks.client.integration.oauth.connect.mockResolvedValue(attempt("auto", "https://github.com/login/device"))
        await expect(startOauth("anthropic", { methodId: "device" })).resolves.toMatchObject({ mode: "auto", instructions: "Enter code: AB-12" })
    })

    it("cancela e recusa o login com retorno em localhost", async () => {
        mocks.client.integration.oauth.connect.mockResolvedValue(attempt("auto", "https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback"))
        mocks.client.integration.oauth.cancel.mockResolvedValue(undefined)
        await expect(startOauth("anthropic", { methodId: "device" })).rejects.toMatchObject({ status: 409, code: "OPENCODE_OAUTH_LOCAL_CALLBACK" })
        expect(mocks.client.integration.oauth.cancel).toHaveBeenCalledWith({ integrationID: "anthropic", attemptID: "att_1", location: { directory: "/repo" } })
    })

    it("ao concluir pelo status, seleciona a conta nova uma única vez", async () => {
        mocks.client.integration.oauth.connect.mockResolvedValue(attempt("auto", "https://github.com/login/device"))
        await startOauth("anthropic", { methodId: "device" })
        mocks.client.integration.oauth.status.mockResolvedValue({ data: { status: "complete", time: { created: 1, expires: 2 } } })
        mocks.client.credential.list.mockResolvedValue([existing, created])
        await expect(oauthStatus("anthropic", "att_1")).resolves.toEqual({ status: "complete", message: null })
        await oauthStatus("anthropic", "att_1")
        expect(mocks.client.credential.activate).toHaveBeenCalledOnce()
        expect(mocks.audit).toHaveBeenCalledOnce()
    })
})

describe("selecionar e remover", () => {
    it("seleciona a conta e audita a troca", async () => {
        mocks.client.credential.list.mockResolvedValue([existing, created])
        await activateAccount("cred_new")
        expect(mocks.client.credential.activate).toHaveBeenCalledWith({ credentialID: "cred_new" })
        expect(mocks.audit.mock.calls[0]![0]).toMatchObject({ entidadeId: "cred_new", antes: { contaSelecionada: "Antiga" }, depois: { contaSelecionada: "Nova" } })
    })

    it("conta inexistente responde 404 sem chamar o OpenCode", async () => {
        await expect(removeAccount("cred_zzz")).rejects.toMatchObject({ status: 404 })
        expect(mocks.client.credential.remove).not.toHaveBeenCalled()
    })
})

describe("toDomainError", () => {
    it("traduz os erros do OpenCode para pt-BR", () => {
        expect(toDomainError({ _tag: "UnauthorizedError", message: "Authentication required" })).toMatchObject({ status: 502, code: "OPENCODE_UNAUTHORIZED" })
        expect(toDomainError({ _tag: "IntegrationNotFoundError", message: "x" })).toMatchObject({ status: 404 })
        expect(toDomainError({ name: "ClientError", reason: "Transport" })).toMatchObject({ code: "OPENCODE_UNREACHABLE" })
        expect(toDomainError(new Error("boom"))).toBeInstanceOf(DomainError)
    })
})
