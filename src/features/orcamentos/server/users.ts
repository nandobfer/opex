import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { OrcamentoClient } from "@/lib/db/models/Orcamento"
import { User } from "@/lib/db/models/User"
import { publishAppEvent } from "@/lib/pusher/channels"
import { hashPassword } from "@/features/auth/server/password"
import { clienteLoginPath, ORCAMENTOS_UPDATED_EVENT, USUARIO_AUDIT_ENTITY } from "../constants"
import { randomUsernameSuffix, usernameFromName } from "../logic"
import type { ClienteUserInput } from "../schemas"
import type { ClientMembershipDto, ClienteUserDto, CreatedClienteUserDto } from "../types"
import { newUserTokenValue, type ClienteOrcamentoDoc, type UserDoc } from "./token"

/**
 * Usuários de cliente (SOMENTE servidor). São **globais** (um login pode pertencer a vários
 * clientes), com a flag `admin` **por vínculo**.
 *
 * Regras de gestão:
 * - o **dono** do Opex gerencia tudo (credenciais globais, vínculos e tokens);
 * - o **admin do cliente** gerencia o próprio vínculo e usuários **exclusivos** dele; usuários
 *   compartilhados com outros clientes só podem ser alterados pelo dono;
 * - o **usuário padrão** do cliente (usa o token do cliente) não pode ser excluído — só na exclusão
 *   do cliente — e o token dele (o token do cliente) é regenerado apenas pelo dono.
 */

const OBJECT_ID = /^[a-f0-9]{24}$/i

const isDuplicateKey = (error: unknown): boolean => typeof error === "object" && error !== null && (error as { code?: number }).code === 11000

function isDefaultUser(doc: UserDoc): boolean {
    return Boolean(doc.defaultForClientId)
}

/** Cliente padrão de um usuário (o vínculo marcado como o dono do token do cliente). */
function defaultMembership(doc: UserDoc): string | null {
    return doc.defaultForClientId ?? null
}

async function clientNames(ids: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)].filter((id) => OBJECT_ID.test(id))
    if (unique.length === 0) return new Map()
    const docs = await OrcamentoClient.find({ _id: { $in: unique } })
        .select({ name: 1 })
        .lean()
    return new Map(docs.map((doc) => [String(doc._id), doc.name]))
}

function toMemberships(doc: UserDoc, names: Map<string, string>): ClientMembershipDto[] {
    return (doc.memberships ?? []).map((membership) => ({ clientId: membership.clientId, clientName: names.get(membership.clientId) ?? null, admin: Boolean(membership.admin) }))
}

function toDto(doc: UserDoc, client: ClienteOrcamentoDoc, names: Map<string, string>): ClienteUserDto {
    const default_ = isDefaultUser(doc)
    const membership = (doc.memberships ?? []).find((item) => item.clientId === String(client._id))
    const tokenValue = default_ ? (client.token ?? "") : (doc.token ?? "")
    return {
        id: String(doc._id),
        username: doc.username,
        email: doc.email ?? null,
        admin: Boolean(membership?.admin),
        isDefault: default_,
        portalPath: tokenValue ? clienteLoginPath(tokenValue) : "",
        active: doc.active !== false,
        memberships: toMemberships(doc, names),
        createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    }
}

/** Usuário **ativo** por username ou email (login). Comparação sem diferenciar maiúsculas. */
export async function findActiveUserByLogin(identifier: string): Promise<UserDoc | null> {
    const value = identifier.trim()
    if (!value) return null
    await dbConnect()
    return (await User.findOne({ $or: [{ username: value }, { email: value.toLowerCase() }] })
        .collation({ locale: "en", strength: 2 })
        .lean()) as UserDoc | null
}

/** Todos os usuários vinculados ao cliente (com os nomes dos outros clientes compartilhados). */
export async function listClientUsers(client: ClienteOrcamentoDoc): Promise<ClienteUserDto[]> {
    await dbConnect()
    const docs = (await User.find({ "memberships.clientId": String(client._id) }).sort({ username: 1 }).lean()) as UserDoc[]
    const names = await clientNames(docs.flatMap((doc) => (doc.memberships ?? []).map((item) => item.clientId)))
    return docs.map((doc) => toDto(doc, client, names))
}

/** Username livre: usa o desejado e, em colisão, acrescenta um sufixo alfabético curto. */
export async function uniqueUsername(desired: string): Promise<string> {
    const base = desired.trim()
    if (!(await User.exists({ username: base }))) return base
    for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = `${base}-${randomUsernameSuffix()}`
        if (!(await User.exists({ username: candidate }))) return candidate
    }
    return `${base}-${randomUsernameSuffix(8)}`
}

const normalizeEmail = (value: string | undefined): string | null => {
    const trimmed = value?.trim().toLowerCase()
    return trimmed ? trimmed : null
}

async function assertEmailFree(email: string | null, exceptUserId?: string): Promise<void> {
    if (!email) return
    const existing = await User.findOne({ email }).select({ _id: 1 }).lean()
    if (existing && String(existing._id) !== exceptUserId) throw new DomainError(409, "Este email já está em uso", "EMAIL_IN_USE")
}

async function assertUsernameFree(username: string, exceptUserId?: string): Promise<void> {
    const existing = await User.findOne({ username }).select({ _id: 1 }).lean()
    if (existing && String(existing._id) !== exceptUserId) throw new DomainError(409, "Este nome de usuário já está em uso", "USERNAME_IN_USE")
}

/** Cria o usuário padrão do cliente (sem email/senha, admin, token = do cliente). Idempotente. */
export async function ensureDefaultUser(client: ClienteOrcamentoDoc): Promise<void> {
    await dbConnect()
    const clientId = String(client._id)
    if (await User.exists({ defaultForClientId: clientId })) return
    const username = await uniqueUsername(usernameFromName(client.name))
    await User.create({
        username,
        email: null,
        passwordHash: null,
        memberships: [{ clientId, admin: true }],
        token: null,
        tokenHash: null,
        tokenPrefix: null,
        defaultForClientId: clientId,
        active: true,
    })
}

/** Cria um usuário de cliente dentro do escopo de um cliente. */
export async function createClientUser(client: ClienteOrcamentoDoc, input: ClienteUserInput, actorId: string): Promise<CreatedClienteUserDto> {
    await dbConnect()
    const clientId = String(client._id)
    const email = normalizeEmail(input.email)
    await assertUsernameFree(input.username)
    await assertEmailFree(email)

    const token = newUserTokenValue()
    let doc: UserDoc
    try {
        doc = (await User.create({
            username: input.username,
            email,
            passwordHash: input.password ? await hashPassword(input.password) : null,
            memberships: [{ clientId, admin: input.admin }],
            token: token.token,
            tokenHash: token.hash,
            tokenPrefix: token.prefix,
            defaultForClientId: null,
            active: true,
        })) as unknown as UserDoc
    } catch (error) {
        if (isDuplicateKey(error)) throw new DomainError(409, "Nome de usuário ou email já em uso", "USER_EXISTS")
        throw error
    }

    await recordAudit({ userId: actorId, entidade: USUARIO_AUDIT_ENTITY, entidadeId: String(doc._id), acao: AcaoAuditoria.CRIAR, depois: { username: doc.username, email, admin: input.admin, cliente: client.name } })
    await publishAppEvent(ORCAMENTOS_UPDATED_EVENT, { scope: "users", clientId })
    const names = await clientNames([clientId])
    return { token: token.token, item: toDto(doc, client, names) }
}

/** `true` quando o ator (admin do cliente) pode alterar as credenciais globais do usuário. */
function canManageGlobally(doc: UserDoc, owner: boolean, clientId: string): boolean {
    if (owner) return true
    // Admin do cliente: só usuários exclusivos deste cliente (não compartilhados).
    return (doc.memberships ?? []).length === 1 && (doc.memberships ?? [])[0]!.clientId === clientId
}

function assertCanManage(doc: UserDoc, owner: boolean, clientId: string): void {
    if (canManageGlobally(doc, owner, clientId)) return
    throw new DomainError(403, "Usuário compartilhado com outros clientes: só o dono do Opex pode alterá-lo.", "SHARED_USER")
}

async function loadUser(userId: string): Promise<UserDoc> {
    if (!OBJECT_ID.test(userId)) throw new DomainError(404, "Usuário não encontrado", "USER_NOT_FOUND")
    const doc = (await User.findById(userId).lean()) as UserDoc | null
    if (!doc) throw new DomainError(404, "Usuário não encontrado", "USER_NOT_FOUND")
    return doc
}

async function assertMember(doc: UserDoc, clientId: string): Promise<void> {
    if (!(doc.memberships ?? []).some((membership) => membership.clientId === clientId)) throw new DomainError(404, "Usuário não encontrado", "USER_NOT_FOUND")
}

/** Atualiza um usuário no escopo de um cliente (username/email/senha/flag admin do vínculo). */
export async function updateClientUser(client: ClienteOrcamentoDoc, userId: string, input: ClienteUserInput, actorId: string, options: { owner: boolean }): Promise<ClienteUserDto> {
    await dbConnect()
    const clientId = String(client._id)
    const doc = await loadUser(userId)
    await assertMember(doc, clientId)
    assertCanManage(doc, options.owner, clientId)

    const email = normalizeEmail(input.email)
    await assertUsernameFree(input.username, userId)
    await assertEmailFree(email, userId)

    const set: Record<string, unknown> = { username: input.username, email, memberships: (doc.memberships ?? []).map((membership) => (membership.clientId === clientId ? { ...membership, admin: input.admin } : membership)) }
    if (input.password) set.passwordHash = await hashPassword(input.password)

    await User.updateOne({ _id: userId }, { $set: set })
    await recordAudit({
        userId: actorId,
        entidade: USUARIO_AUDIT_ENTITY,
        entidadeId: userId,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { username: doc.username, email: doc.email ?? null, admin: Boolean((doc.memberships ?? []).find((m) => m.clientId === clientId)?.admin) },
        depois: { username: input.username, email, admin: input.admin, senha: input.password ? "alterada" : "mantida" },
    })
    await publishAppEvent(ORCAMENTOS_UPDATED_EVENT, { scope: "users", clientId })
    const updated = (await User.findById(userId).lean()) as UserDoc
    const names = await clientNames((updated.memberships ?? []).map((item) => item.clientId))
    return toDto(updated, client, names)
}

/**
 * Remove o **vínculo** do usuário com o cliente; sem outros vínculos, exclui o usuário. O usuário
 * padrão do cliente não pode ser excluído por aqui (só na exclusão do cliente).
 */
export async function deleteClientUser(client: ClienteOrcamentoDoc, userId: string, actorId: string, options: { owner: boolean }): Promise<void> {
    await dbConnect()
    const clientId = String(client._id)
    const doc = await loadUser(userId)
    await assertMember(doc, clientId)
    if (defaultMembership(doc) === clientId) throw new DomainError(400, "O usuário padrão do cliente não pode ser excluído", "DEFAULT_USER")
    assertCanManage(doc, options.owner, clientId)

    const remaining = (doc.memberships ?? []).filter((membership) => membership.clientId !== clientId)
    if (remaining.length === 0) {
        await User.deleteOne({ _id: userId })
    } else {
        await User.updateOne({ _id: userId }, { $set: { memberships: remaining } })
    }
    await recordAudit({ userId: actorId, entidade: USUARIO_AUDIT_ENTITY, entidadeId: userId, acao: AcaoAuditoria.EXCLUIR, antes: { username: doc.username, cliente: client.name, vinculos: remaining.length } })
    await publishAppEvent(ORCAMENTOS_UPDATED_EVENT, { scope: "users", clientId })
}

/** Regenera o token próprio do usuário (invalida o anterior). Recusa o usuário padrão. */
export async function regenerateClientUserToken(client: ClienteOrcamentoDoc, userId: string, actorId: string, options: { owner: boolean }): Promise<CreatedClienteUserDto> {
    await dbConnect()
    const clientId = String(client._id)
    const doc = await loadUser(userId)
    await assertMember(doc, clientId)
    assertCanManage(doc, options.owner, clientId)
    if (isDefaultUser(doc)) throw new DomainError(400, "O usuário padrão usa o token do cliente; regenere o token na aba Token.", "DEFAULT_USER_TOKEN")

    const token = newUserTokenValue()
    await User.updateOne({ _id: userId }, { $set: { token: token.token, tokenHash: token.hash, tokenPrefix: token.prefix } })
    await recordAudit({ userId: actorId, entidade: USUARIO_AUDIT_ENTITY, entidadeId: userId, acao: AcaoAuditoria.ATUALIZAR, antes: { token: doc.tokenPrefix }, depois: { token: token.prefix } })
    await publishAppEvent(ORCAMENTOS_UPDATED_EVENT, { scope: "users", clientId })
    const names = await clientNames([clientId])
    return { token: token.token, item: toDto({ ...doc, token: token.token, tokenPrefix: token.prefix }, client, names) }
}

/**
 * Remove os vínculos de todos os usuários com o cliente (usado na exclusão do cliente); usuários que
 * ficarem sem vínculos são excluídos.
 */
export async function removeClientUsers(clientId: string): Promise<void> {
    await dbConnect()
    const docs = (await User.find({ "memberships.clientId": clientId }).lean()) as UserDoc[]
    for (const doc of docs) {
        const remaining = (doc.memberships ?? []).filter((membership) => membership.clientId !== clientId)
        if (remaining.length === 0) {
            await User.deleteOne({ _id: doc._id })
        } else {
            await User.updateOne({ _id: doc._id }, { $set: { memberships: remaining, ...(doc.defaultForClientId === clientId ? { defaultForClientId: null } : {}) } })
        }
    }
}

/** Vínculos do usuário considerados ativos (cliente existente e ativo). */
export async function activeMemberships(doc: UserDoc): Promise<Array<{ clientId: string; admin: boolean; name: string }>> {
    const ids = (doc.memberships ?? []).map((membership) => membership.clientId)
    if (ids.length === 0) return []
    const clients = await OrcamentoClient.find({ _id: { $in: ids }, active: true })
        .select({ name: 1 })
        .lean()
    const byId = new Map(clients.map((client) => [String(client._id), client.name]))
    return (doc.memberships ?? [])
        .filter((membership) => byId.has(membership.clientId))
        .map((membership) => ({ clientId: membership.clientId, admin: Boolean(membership.admin), name: byId.get(membership.clientId)! }))
}
