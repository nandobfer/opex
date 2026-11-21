import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * OAuth dos MCPs remotos do OpenCode (OPE-176): montagem da chave `oauth` no `opencode.jsonc`,
 * formulário, conferência da URL de retorno colada e o fluxo pela API de integrações do OpenCode
 * (cliente simulado — nunca rede real).
 */

const holder = vi.hoisted(() => ({ audit: [] as Record<string, unknown>[], events: [] as unknown[], entry: null as unknown }))
vi.mock("@/lib/db", () => ({ recordAudit: async (input: Record<string, unknown>) => void holder.audit.push(input), AcaoAuditoria: { ATUALIZAR: "ATUALIZAR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: async (...args: unknown[]) => void holder.events.push(args) }))
vi.mock("@/lib/logger", () => ({ loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock("@/features/opencode-resources/server/mcps", () => ({ entryOf: async () => holder.entry }))

import { buildMcpEntry, mcpDetailOf, withSecrets } from "@/features/opencode-resources/mcp-entry"
import { mcpContentFromForm, mcpFormFromDetail, mcpFormSchema } from "@/features/opencode-resources/form-schemas"
import { authorizationStateOf, callbackTargetOf, forwardableCallback } from "@/features/opencode-resources/mcp-oauth"
import { forwardOauthCallbackCommand } from "@/features/opencode-resources/commands"
import { completeMcpOauth, disconnectMcpOauth, mcpAuthorization, mcpOauthStatus, startMcpOauth } from "@/features/opencode-resources/server/mcp-auth"
import type { ScopeContext } from "@/features/opencode-resources/server/context"

const LOGIN_URL =
    "https://mcp.linear.app/authorize?response_type=code&client_id=https%3A%2F%2Fopencode.ai%2Foauth%2Fopencode%2Fclient.json&code_challenge=abc&code_challenge_method=S256&redirect_uri=http%3A%2F%2F127.0.0.1%3A36113%2Fcallback&state=st-1&scope=read+write"

describe("chave oauth do MCP remoto", () => {
    it("OAuth grava os campos preenchidos em snake_case, sem cabeçalhos, preservando chaves extras", () => {
        const entry = buildMcpEntry(
            { type: "remote", url: "https://mcp", auth: "oauth", oauth: { clientId: "cid", scope: "read", callbackPort: 19876, redirectUri: "", authServerMetadataUrl: "" } },
            { type: "remote", url: "https://mcp", headers: { Authorization: "Bearer x" }, codemode: true },
            { oauthClientSecret: "sec" },
            "replace",
        )
        expect(entry).toEqual({ type: "remote", url: "https://mcp", disabled: false, codemode: true, oauth: { client_id: "cid", client_secret: "sec", scope: "read", callback_port: 19876 } })
        expect(buildMcpEntry({ type: "remote", url: "https://mcp", auth: "oauth" }, undefined, undefined, "replace").oauth).toEqual({})
    })

    it("client secret: ausente mantém, null remove e sem client id sai", () => {
        const previous = { type: "remote", url: "https://mcp", oauth: { client_id: "cid", client_secret: "antigo" } }
        const keep = buildMcpEntry({ type: "remote", url: "https://mcp", auth: "oauth", oauth: { clientId: "cid" } }, previous, {}, "replace")
        expect(keep.oauth).toEqual({ client_id: "cid", client_secret: "antigo" })
        expect(buildMcpEntry({ type: "remote", url: "https://mcp", auth: "oauth", oauth: { clientId: "cid" } }, previous, { oauthClientSecret: null }, "replace").oauth).toEqual({ client_id: "cid" })
        expect(buildMcpEntry({ type: "remote", url: "https://mcp", auth: "oauth", oauth: {} }, previous, {}, "replace").oauth).toEqual({})
        expect(withSecrets(previous, { oauthClientSecret: "novo" }).oauth).toEqual({ client_id: "cid", client_secret: "novo" })
        expect(withSecrets(previous, { oauthClientSecret: null }).oauth).toEqual({ client_id: "cid" })
    })

    it("cabeçalhos/nenhuma: sem oauth; caixa grava oauth:false; oauth:false existente é preservado", () => {
        const fromOauth = { type: "remote", url: "https://mcp", oauth: { client_id: "cid" } }
        expect(buildMcpEntry({ type: "remote", url: "https://mcp", auth: "headers" }, fromOauth, { headers: [{ key: "X", value: "1" }] }, "replace")).toEqual({ type: "remote", url: "https://mcp", disabled: false, headers: { X: "1" } })
        expect(buildMcpEntry({ type: "remote", url: "https://mcp", auth: "none", disableAutoOauth: true }, undefined, undefined, "replace").oauth).toBe(false)
        expect(buildMcpEntry({ type: "remote", url: "https://mcp", auth: "none" }, { type: "remote", url: "https://mcp", oauth: false }, undefined, "replace").oauth).toBe(false)
        expect(buildMcpEntry({ type: "remote", url: "https://mcp", auth: "none", disableAutoOauth: false }, { type: "remote", url: "https://mcp", oauth: false }, undefined, "replace").oauth).toBeUndefined()
    })

    it("regressão: chamada sem a escolha (agente/antigas) mantém cabeçalhos e a chave oauth do arquivo", () => {
        const previous = { type: "remote", url: "https://mcp", headers: { A: "1" }, oauth: { client_id: "cid", client_secret: "s" } }
        expect(buildMcpEntry({ type: "remote", url: "https://mcp" }, previous, { headers: [{ key: "A" }] }, "replace")).toEqual({ ...previous, disabled: false })
    })

    it("detalhe infere a autenticação e nunca expõe o client secret", () => {
        const detail = mcpDetailOf({ type: "remote", url: "https://mcp", oauth: { client_id: "cid", client_secret: "s", callback_port: 1 } })
        expect(detail.auth).toBe("oauth")
        expect(detail.oauth).toEqual({ clientId: "cid", scope: null, callbackPort: 1, redirectUri: null, authServerMetadataUrl: null, hasClientSecret: true })
        expect(JSON.stringify(detail)).not.toContain('"s"')
        expect(mcpDetailOf({ type: "remote", url: "https://mcp", headers: { A: "1" } }).auth).toBe("headers")
        expect(mcpDetailOf({ type: "remote", url: "https://mcp", oauth: false })).toMatchObject({ auth: "none", oauth: false })
    })

    it("formulário: ida e volta do OAuth com segredo salvo e validação dos campos", () => {
        const form = mcpFormFromDetail("linear", mcpDetailOf({ type: "remote", url: "https://mcp", oauth: { client_id: "cid", client_secret: "s" } }))
        expect(form).toMatchObject({ auth: "oauth", oauthClientId: "cid", oauthClientSecretSaved: true, oauthClientSecret: "" })
        expect(mcpFormSchema.safeParse(form).success).toBe(true)
        expect(mcpContentFromForm(form)).toEqual({ mcp: { type: "remote", url: "https://mcp", disabled: false, auth: "oauth", oauth: { clientId: "cid" } }, secrets: { headers: [] } })
        expect(mcpContentFromForm({ ...form, oauthClientId: "" }).secrets).toEqual({ headers: [], oauthClientSecret: null })
        expect(mcpFormSchema.safeParse({ ...form, oauthCallbackPort: "70000" }).success).toBe(false)
        expect(mcpFormSchema.safeParse({ ...form, oauthRedirectUri: "nao-e-url" }).success).toBe(false)
    })
})

describe("retorno do OAuth no loopback do host", () => {
    const target = callbackTargetOf(LOGIN_URL)!

    it("lê porta, caminho e state da URL de login do OpenCode", () => {
        expect(target).toEqual({ redirectUri: "http://127.0.0.1:36113/callback", port: 36113, path: "/callback", state: "st-1" })
        expect(callbackTargetOf("https://auth/authorize?redirect_uri=https%3A%2F%2Fopex.dev%2Fcb")).toBeNull()
    })

    it("aceita só o retorno exato da tentativa e monta a URL do loopback com os parâmetros do OAuth", () => {
        expect(forwardableCallback("http://localhost:36113/callback?code=c1&state=st-1&extra=1", target)).toEqual({ ok: true, url: "http://127.0.0.1:36113/callback?code=c1&state=st-1" })
        expect(forwardableCallback("http://evil.test:36113/callback?code=c&state=st-1", target).ok).toBe(false)
        expect(forwardableCallback("http://127.0.0.1:1234/callback?code=c&state=st-1", target).ok).toBe(false)
        expect(forwardableCallback("http://127.0.0.1:36113/outro?code=c&state=st-1", target).ok).toBe(false)
        expect(forwardableCallback("http://127.0.0.1:36113/callback?code=c&state=outro", target).ok).toBe(false)
        expect(forwardableCallback("http://127.0.0.1:36113/callback?state=st-1", target).ok).toBe(false)
        expect(forwardableCallback("lixo", target).ok).toBe(false)
    })

    it("o comando do host só aceita URL do loopback (sem aspas para quebrar o shell)", () => {
        expect(forwardOauthCallbackCommand("http://127.0.0.1:36113/callback?code=c1&state=st-1")).toContain("'http://127.0.0.1:36113/callback?code=c1&state=st-1'")
        expect(() => forwardOauthCallbackCommand("http://127.0.0.1:1/callback?x=';rm -rf ~;'")).toThrow()
        expect(() => forwardOauthCallbackCommand("https://evil/callback")).toThrow()
    })

    it("situação da autorização a partir do mcp.list e das credenciais", () => {
        expect(authorizationStateOf({ status: "needs_auth", error: "login" }, []).state).toBe("needs_auth")
        expect(authorizationStateOf({ status: "connected" }, [{ id: "c", label: "x", status: null }]).state).toBe("authorized")
        expect(authorizationStateOf({ status: "connected" }, []).state).toBe("not_required")
        expect(authorizationStateOf({ status: "failed", error: "boom" }, []).state).toBe("error")
    })
})

function fakeCtx() {
    let connections = [{ type: "credential", id: "old", label: "linear", method: "oauth" }] as Record<string, unknown>[]
    const client = {
        mcp: {
            list: vi.fn(async () => ({ data: [{ name: "linear", status: { status: "needs_auth", error: "requires a login" }, integrationID: "mcp_1" }] })),
            connect: vi.fn(async () => undefined),
            disconnect: vi.fn(async () => undefined),
        },
        integration: {
            get: vi.fn(async () => ({ data: { id: "mcp_1", name: "linear", methods: [{ id: "mcp_1", type: "oauth", label: "linear" }], connections } })),
            oauth: {
                connect: vi.fn(async () => ({ data: { attemptID: "att-1", url: LOGIN_URL, instructions: "Authorize", mode: "auto", time: { created: 1, expires: Date.now() + 600_000 } } })),
                status: vi.fn(async () => ({ data: { status: "complete", time: { created: 1, expires: 2 } } })),
                complete: vi.fn(async () => undefined),
                cancel: vi.fn(async () => undefined),
            },
        },
        credential: { remove: vi.fn(async () => undefined) },
    }
    const run = vi.fn(async () => ({ exitCode: 0, output: "200", status: "completed" }))
    const ctx = { host: { client, run }, location: { directory: "/home/u" } } as unknown as ScopeContext
    return { ctx, client, run, setConnections: (next: Record<string, unknown>[]) => (connections = next) }
}

describe("autorização pela API do OpenCode", () => {
    beforeEach(() => {
        holder.audit = []
        holder.events = []
        holder.entry = { name: "linear", disabled: false, config: { type: "remote", url: "https://mcp.linear.app/mcp" } }
    })

    it("situação e início: usa o integrationID do mcp.list e avisa que o retorno é no host", async () => {
        const { ctx, client } = fakeCtx()
        expect(await mcpAuthorization(ctx, "linear")).toMatchObject({ state: "needs_auth", integrationId: "mcp_1" })
        const attempt = await startMcpOauth(ctx, "global", "linear", { id: "local", origin: "ui" })
        expect(client.integration.oauth.connect).toHaveBeenCalledWith({ integrationID: "mcp_1", location: { directory: "/home/u" }, methodID: "mcp_1" })
        expect(attempt).toMatchObject({ attemptId: "att-1", mode: "auto", localCallback: true })
    })

    it("colar a URL de retorno repassa ao loopback, substitui a credencial antiga e audita sem segredos", async () => {
        const { ctx, client, run, setConnections } = fakeCtx()
        await startMcpOauth(ctx, "global", "linear", { id: "local", origin: "ui" })
        setConnections([
            { type: "credential", id: "old", label: "linear", method: "oauth" },
            { type: "credential", id: "new", label: "linear", method: "oauth" },
        ])
        const result = await completeMcpOauth(ctx, "global", "linear", "att-1", { callbackUrl: "http://127.0.0.1:36113/callback?code=segredo&state=st-1" })
        expect(result.status).toBe("complete")
        expect(run).toHaveBeenCalledWith(expect.stringContaining("http://127.0.0.1:36113/callback?code=segredo&state=st-1"), 30_000, expect.objectContaining({ redactedAs: expect.any(String) }))
        expect(client.credential.remove).toHaveBeenCalledWith({ credentialID: "old" })
        expect(client.credential.remove).not.toHaveBeenCalledWith({ credentialID: "new" })
        expect(client.mcp.connect).toHaveBeenCalled()
        expect(JSON.stringify(holder.audit)).not.toContain("segredo")
        expect(holder.events).toContainEqual(["opencode-resources-updated", { kind: "mcp", scope: "global" }])
    })

    it("URL de outra tentativa é recusada sem chamar o host", async () => {
        const { ctx, run } = fakeCtx()
        await startMcpOauth(ctx, "global", "linear", { id: "local", origin: "ui" })
        await expect(completeMcpOauth(ctx, "global", "linear", "att-1", { callbackUrl: "http://127.0.0.1:36113/callback?code=x&state=outro" })).rejects.toMatchObject({ code: "OPENCODE_MCP_OAUTH_CALLBACK_INVALID" })
        expect(run).not.toHaveBeenCalled()
        await expect(mcpOauthStatus(ctx, "global", "outro", "att-1")).rejects.toMatchObject({ code: "OPENCODE_LOGIN_NOT_FOUND" })
    })

    it("MCP local ou com oauth:false não inicia autorização", async () => {
        const { ctx } = fakeCtx()
        holder.entry = { name: "linear", disabled: false, config: { type: "remote", url: "https://mcp", oauth: false } }
        await expect(startMcpOauth(ctx, "global", "linear", { id: "local", origin: "ui" })).rejects.toMatchObject({ code: "OPENCODE_MCP_OAUTH_DISABLED" })
        holder.entry = { name: "linear", disabled: false, config: { type: "local", command: ["x"] } }
        await expect(startMcpOauth(ctx, "global", "linear", { id: "local", origin: "ui" })).rejects.toMatchObject({ code: "OPENCODE_MCP_OAUTH_UNSUPPORTED" })
    })

    it("desconectar remove as credenciais OAuth do MCP e reconecta", async () => {
        const { ctx, client } = fakeCtx()
        expect(await disconnectMcpOauth(ctx, "global", "linear", { id: "local", origin: "ui" })).toEqual({ removed: 1 })
        expect(client.credential.remove).toHaveBeenCalledWith({ credentialID: "old" })
        expect(holder.audit[0]?.depois).toMatchObject({ acao: "desconectar", nome: "linear" })
    })
})
