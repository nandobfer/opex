import type { CredentialEntry, IntegrationInfo } from "@opencode/client"
import { DomainError } from "@/lib/api/route"
import { recordAudit, AcaoAuditoria } from "@/lib/audit/record"
import { clearAiCatalogCache } from "@/lib/ai/catalog"
import { AiProviderError } from "@/lib/ai/errors"
import { getOpencodeConnection } from "@/lib/ai/opencode"
import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import { dbConnect } from "@/lib/db"
import { getLocalUser } from "@/lib/local-user"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { OPENCODE_ACCOUNTS_AUDIT_ENTITY, OPENCODE_ACCOUNTS_UPDATED_EVENT } from "../constants"
import { cleanFormAnswer, defaultFormAnswer, formAnswerSchema, mergeAuthProviders, usesLocalCallback } from "../logic"
import type {
    CommandStartInput,
    KeyConnectInput,
    OauthStartInput,
    OpencodeAuthProviderDto,
    OpencodeCommandAttemptDto,
    OpencodeFormAnswer,
    OpencodeFormField,
    OpencodeLoginStatusDto,
    OpencodeOauthAttemptDto,
} from "../types"

/**
 * Contas (credenciais) dos providers do OpenCode — SOMENTE servidor. Equivale ao fluxo do TUI
 * (Providers → provider → adicionar/selecionar conta) pelo `@opencode/client`. O valor das
 * credenciais nunca sai daqui nem entra em log ou auditoria.
 */

const log = loggerFor({ module: "opencode-accounts" })

interface Session {
    client: OpencodeClient
    location: { directory: string } | undefined
}

/** Login em andamento (OAuth automático ou comando): o que é preciso para concluir no app. */
interface PendingLogin {
    integrationId: string
    method: "oauth" | "command"
    methodLabel: string
    beforeIds: string[]
    expiresAt: number
}

const globalForLogins = globalThis as unknown as { opencodeAccountLogins?: Map<string, PendingLogin> }
const pendingLogins = (globalForLogins.opencodeAccountLogins ??= new Map<string, PendingLogin>())

function prunePending(now = Date.now()) {
    for (const [id, login] of pendingLogins) if (login.expiresAt + 60_000 < now) pendingLogins.delete(id)
}

/** Erro do OpenCode (objeto com `_tag` ou `ClientError`) → `DomainError` com mensagem em pt-BR. */
export function toDomainError(error: unknown): DomainError {
    if (error instanceof DomainError) return error
    if (error instanceof AiProviderError) return new DomainError(502, error.message, "AI_PROVIDER_ERROR")
    const record = (error && typeof error === "object" ? error : {}) as { _tag?: unknown; name?: unknown; message?: unknown; reason?: unknown }
    const tag = typeof record._tag === "string" ? record._tag : typeof record.name === "string" ? record.name : ""
    const message = typeof record.message === "string" ? record.message : ""
    if (tag === "UnauthorizedError") return new DomainError(502, "O OpenCode recusou a senha: confira a senha do servidor na aba Configuração", "OPENCODE_UNAUTHORIZED")
    if (tag === "IntegrationAttemptNotFoundError") return new DomainError(404, "O login expirou ou não existe mais no OpenCode: comece de novo", "OPENCODE_LOGIN_NOT_FOUND")
    if (tag === "IntegrationMethodNotFoundError") return new DomainError(404, "Método de login não encontrado no OpenCode", "OPENCODE_METHOD_NOT_FOUND")
    if (tag === "IntegrationNotFoundError") return new DomainError(404, "Provider não encontrado no OpenCode", "OPENCODE_PROVIDER_NOT_FOUND")
    if (/NotFound/.test(tag)) return new DomainError(404, "Conta não encontrada no OpenCode", "OPENCODE_ACCOUNT_NOT_FOUND")
    if (tag === "InvalidRequestError") return new DomainError(400, message ? `O OpenCode recusou o pedido: ${message}` : "O OpenCode recusou o pedido", "OPENCODE_INVALID_REQUEST")
    if (tag === "ClientError" && record.reason === "Transport") return new DomainError(502, "Não foi possível conectar ao OpenCode: confira a URL do servidor", "OPENCODE_UNREACHABLE")
    return new DomainError(502, message ? `O OpenCode respondeu com erro: ${message}` : "O OpenCode respondeu com erro", "OPENCODE_ERROR")
}

async function call<T>(action: string, run: () => Promise<T>): Promise<T> {
    try {
        return await run()
    } catch (error) {
        const domain = toDomainError(error)
        if (domain.status >= 500) log.warn({ action, code: domain.code }, "[opencode-accounts] Falha no OpenCode")
        throw domain
    }
}

async function openSession(): Promise<Session> {
    const connection = await call("connection", () => getOpencodeConnection())
    const client = await getOpencodeClient(connection)
    return { client, location: connection.directory ? { directory: connection.directory } : undefined }
}

const listCredentials = (session: Session) => call("credential.list", () => session.client.credential.list())

async function findCredential(session: Session, credentialId: string): Promise<CredentialEntry> {
    const credential = (await listCredentials(session)).find((item) => item.id === credentialId)
    if (!credential) throw new DomainError(404, "Conta não encontrada no OpenCode", "OPENCODE_ACCOUNT_NOT_FOUND")
    return credential
}

async function getIntegration(session: Session, integrationId: string): Promise<IntegrationInfo> {
    return (await call("integration.get", () => session.client.integration.get({ integrationID: integrationId, location: session.location }))).data
}

/** Auditoria (sem segredos) + catálogo de modelos renovado + evento em `private-app`. */
async function announce(input: { integrationId: string; entityId: string; action: (typeof AcaoAuditoria)[keyof typeof AcaoAuditoria]; before?: Record<string, unknown>; after?: Record<string, unknown> }) {
    await dbConnect()
    await recordAudit({ userId: getLocalUser().id, entidade: OPENCODE_ACCOUNTS_AUDIT_ENTITY, entidadeId: input.entityId, acao: input.action, antes: input.before, depois: input.after })
    clearAiCatalogCache()
    await publishAppEvent(OPENCODE_ACCOUNTS_UPDATED_EVENT, { integrationId: input.integrationId })
}

/** Valida a resposta do formulário do método e completa os campos ocultos com o padrão. */
function prepareAnswer(fields: readonly OpencodeFormField[], answer: OpencodeFormAnswer | undefined): OpencodeFormAnswer | undefined {
    const merged = { ...defaultFormAnswer(fields), ...(answer ?? {}) }
    const parsed = formAnswerSchema(fields).safeParse(merged)
    if (!parsed.success) throw new DomainError(400, parsed.error.issues[0]?.message ?? "Formulário inválido", "OPENCODE_INVALID_ANSWER", parsed.error.issues)
    return cleanFormAnswer(fields, merged)
}

/**
 * Depois de um login concluído: a conta nova vira a selecionada (como no TUI) quando o OpenCode
 * não a ativou sozinho; registra auditoria e avisa a tela.
 */
async function settleNewAccount(session: Session, integrationId: string, beforeIds: readonly string[] | null, method: string, methodLabel: string) {
    const credentials = (await listCredentials(session)).filter((item) => item.integrationID === integrationId)
    const created = beforeIds ? credentials.filter((item) => !beforeIds.includes(item.id)) : []
    const newest = created.at(-1)
    if (newest && !newest.active) await call("credential.activate", () => session.client.credential.activate({ credentialID: newest.id }))
    await announce({ integrationId, entityId: newest?.id ?? integrationId, action: AcaoAuditoria.CRIAR, after: { provider: integrationId, conta: newest?.label ?? null, metodo: method, tipoLogin: methodLabel, selecionada: Boolean(newest) } })
}

export async function listAuthProviders(): Promise<OpencodeAuthProviderDto[]> {
    const session = await openSession()
    const [integrations, credentials, providers] = await Promise.all([
        call("integration.list", () => session.client.integration.list({ location: session.location })),
        listCredentials(session),
        call("provider.list", () => session.client.provider.list({ location: session.location })).catch(() => ({ data: [] })),
    ])
    return mergeAuthProviders(integrations.data, credentials, providers.data)
}

export async function connectWithKey(integrationId: string, input: KeyConnectInput): Promise<void> {
    const session = await openSession()
    const integration = await getIntegration(session, integrationId)
    const method = integration.methods.find((item) => item.type === "key")
    if (!method || method.type !== "key") throw new DomainError(409, "Este provider não aceita chave de API", "OPENCODE_METHOD_NOT_FOUND")
    const answer = prepareAnswer(method.form ?? [], input.answer)
    const beforeIds = (await listCredentials(session)).map((item) => item.id)
    await call("integration.connect.key", () => session.client.integration.connect.key({ integrationID: integrationId, location: session.location, key: input.key, label: input.label || undefined, answer }))
    log.info({ integrationId }, "[opencode-accounts] Conta por chave adicionada")
    await settleNewAccount(session, integrationId, beforeIds, "key", method.label ?? "Chave de API")
}

export async function startOauth(integrationId: string, input: OauthStartInput): Promise<OpencodeOauthAttemptDto> {
    const session = await openSession()
    const integration = await getIntegration(session, integrationId)
    const method = integration.methods.find((item) => item.type === "oauth" && item.id === input.methodId)
    if (!method || method.type !== "oauth") throw new DomainError(404, "Método de login não encontrado no OpenCode", "OPENCODE_METHOD_NOT_FOUND")
    const answer = prepareAnswer(method.form ?? [], input.answer)
    const beforeIds = (await listCredentials(session)).map((item) => item.id)
    const attempt = (await call("integration.oauth.connect", () => session.client.integration.oauth.connect({ integrationID: integrationId, location: session.location, methodID: method.id, label: input.label || undefined, answer }))).data
    if (attempt.mode === "auto" && usesLocalCallback(attempt.url)) {
        await session.client.integration.oauth.cancel({ integrationID: integrationId, attemptID: attempt.attemptID, location: session.location }).catch(() => undefined)
        throw new DomainError(409, "Este login conclui pelo navegador da máquina do OpenCode (retorno em localhost). Use o TUI do OpenCode para conectá-lo.", "OPENCODE_OAUTH_LOCAL_CALLBACK")
    }
    prunePending()
    pendingLogins.set(attempt.attemptID, { integrationId, method: "oauth", methodLabel: method.label, beforeIds, expiresAt: attempt.time.expires })
    return { attemptId: attempt.attemptID, url: attempt.url, instructions: attempt.instructions, mode: attempt.mode, expiresAt: attempt.time.expires }
}

/** Conclui o login do modo `code` com o código colado pelo usuário. */
export async function completeOauth(integrationId: string, attemptId: string, code: string): Promise<void> {
    const session = await openSession()
    await call("integration.oauth.complete", () => session.client.integration.oauth.complete({ integrationID: integrationId, attemptID: attemptId, location: session.location, code }))
    const pending = pendingLogins.get(attemptId)
    pendingLogins.delete(attemptId)
    await settleNewAccount(session, integrationId, pending?.beforeIds ?? null, "oauth", pending?.methodLabel ?? "OAuth")
}

/** Status de um login em andamento; ao concluir (primeira vez que o app vê), acerta a conta nova. */
async function loginStatus(kind: "oauth" | "command", integrationId: string, attemptId: string): Promise<OpencodeLoginStatusDto> {
    const session = await openSession()
    const input = { integrationID: integrationId, attemptID: attemptId, location: session.location }
    const data = kind === "oauth" ? (await call("integration.oauth.status", () => session.client.integration.oauth.status(input))).data : (await call("integration.command.status", () => session.client.integration.command.status(input))).data
    const message = "message" in data && typeof data.message === "string" ? data.message : null
    if (data.status !== "pending") {
        const pending = pendingLogins.get(attemptId)
        if (pending) {
            pendingLogins.delete(attemptId)
            if (data.status === "complete") await settleNewAccount(session, integrationId, pending.beforeIds, kind, pending.methodLabel)
        }
    }
    return { status: data.status, message }
}

export const oauthStatus = (integrationId: string, attemptId: string) => loginStatus("oauth", integrationId, attemptId)
export const commandStatus = (integrationId: string, attemptId: string) => loginStatus("command", integrationId, attemptId)

export async function cancelLogin(kind: "oauth" | "command", integrationId: string, attemptId: string): Promise<void> {
    const session = await openSession()
    const input = { integrationID: integrationId, attemptID: attemptId, location: session.location }
    pendingLogins.delete(attemptId)
    try {
        if (kind === "oauth") await session.client.integration.oauth.cancel(input)
        else await session.client.integration.command.cancel(input)
    } catch (error) {
        const domain = toDomainError(error)
        if (domain.status !== 404) throw domain
    }
}

export async function startCommand(integrationId: string, input: CommandStartInput): Promise<OpencodeCommandAttemptDto> {
    const session = await openSession()
    const integration = await getIntegration(session, integrationId)
    const method = integration.methods.find((item) => item.type === "command" && item.id === input.methodId)
    if (!method || method.type !== "command") throw new DomainError(404, "Método de login não encontrado no OpenCode", "OPENCODE_METHOD_NOT_FOUND")
    const beforeIds = (await listCredentials(session)).map((item) => item.id)
    const attempt = (await call("integration.command.connect", () => session.client.integration.command.connect({ integrationID: integrationId, location: session.location, methodID: method.id, label: input.label || undefined }))).data
    const expiresAt = typeof attempt.time.expires === "number" ? attempt.time.expires : Date.now() + 10 * 60_000
    prunePending()
    pendingLogins.set(attempt.attemptID, { integrationId, method: "command", methodLabel: method.label, beforeIds, expiresAt })
    return { attemptId: attempt.attemptID, expiresAt }
}

export async function activateAccount(credentialId: string): Promise<void> {
    const session = await openSession()
    const credentials = await listCredentials(session)
    const credential = credentials.find((item) => item.id === credentialId)
    if (!credential) throw new DomainError(404, "Conta não encontrada no OpenCode", "OPENCODE_ACCOUNT_NOT_FOUND")
    if (credential.active) return
    const previous = credentials.find((item) => item.integrationID === credential.integrationID && item.active)
    await call("credential.activate", () => session.client.credential.activate({ credentialID: credentialId }))
    await announce({ integrationId: credential.integrationID, entityId: credentialId, action: AcaoAuditoria.ATUALIZAR, before: { provider: credential.integrationID, contaSelecionada: previous?.label ?? null }, after: { provider: credential.integrationID, contaSelecionada: credential.label } })
}

export async function renameAccount(credentialId: string, label: string): Promise<void> {
    const session = await openSession()
    const credential = await findCredential(session, credentialId)
    if (credential.label === label) return
    await call("credential.update", () => session.client.credential.update({ credentialID: credentialId, label }))
    await announce({ integrationId: credential.integrationID, entityId: credentialId, action: AcaoAuditoria.ATUALIZAR, before: { provider: credential.integrationID, conta: credential.label }, after: { provider: credential.integrationID, conta: label } })
}

export async function removeAccount(credentialId: string): Promise<void> {
    const session = await openSession()
    const credential = await findCredential(session, credentialId)
    await call("credential.remove", () => session.client.credential.remove({ credentialID: credentialId }))
    await announce({ integrationId: credential.integrationID, entityId: credentialId, action: AcaoAuditoria.EXCLUIR, before: { provider: credential.integrationID, conta: credential.label, metodo: credential.value.type, selecionada: credential.active } })
}
