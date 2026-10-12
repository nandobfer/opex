/**
 * Autorização do servidor Node (SOMENTE servidor). O `middleware` só confere a assinatura do cookie;
 * aqui consultamos o **banco** em cada requisição para resolver o usuário, o cliente selecionado e os
 * papéis **atuais** (mudar/excluir usuário ou perder vínculo bloqueia o acesso na hora).
 */

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import type { NextRequest } from "next/server"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { OrcamentoClient } from "@/lib/db/models/Orcamento"
import { User } from "@/lib/db/models/User"
import { getLocalUser } from "@/lib/local-user"
import { getAuthSecret } from "@/features/auth/server/auth-service"
import { readSessionToken, SESSION_COOKIE_NAME, type SessionPayload } from "@/features/auth/session"
import { PREVIEW_CLIENT_COOKIE } from "@/features/orcamentos/constants"
import type { ClienteOrcamentoDoc, UserDoc } from "@/features/orcamentos/server/token"
import type { ClienteSelectableDto } from "@/features/orcamentos/types"

const OBJECT_ID = /^[a-f0-9]{24}$/i

/** Sessão verificada de um `NextRequest`, ou `null` (fail-closed sem `AUTH_SECRET`). */
export async function sessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
    const secret = getAuthSecret()
    if (!secret) return null
    return readSessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value, secret)
}

/** Sessão verificada de um Server Component (via `next/headers`). */
export async function sessionFromCookies(): Promise<SessionPayload | null> {
    const secret = getAuthSecret()
    if (!secret) return null
    const store = await cookies()
    return readSessionToken(store.get(SESSION_COOKIE_NAME)?.value, secret)
}

/** Exige a sessão do **dono** (admin). */
export async function requireAdminSession(req: NextRequest): Promise<SessionPayload> {
    const session = await sessionFromRequest(req)
    if (!session) throw new DomainError(401, "Sessão ausente ou expirada.", "UNAUTHENTICATED")
    if (session.kind !== "admin") throw new DomainError(403, "Acesso restrito ao dono do Opex.", "FORBIDDEN")
    return session
}

export interface ClientActor {
    /** Id do usuário (auditoria e autoria). */
    userId: string
    /** Nome de exibição (`username` do usuário, ou o dono em pré-visualização). */
    displayName: string
    username: string
    email: string | null
    client: ClienteOrcamentoDoc
    isAdmin: boolean
    /** `true` quando o dono está pré-visualizando o portal. */
    preview: boolean
}

async function loadActiveClient(clientId: string): Promise<ClienteOrcamentoDoc> {
    if (!OBJECT_ID.test(clientId)) throw new DomainError(400, "Cliente inválido", "CLIENT_NOT_FOUND")
    await dbConnect()
    const doc = (await OrcamentoClient.findById(clientId).lean()) as ClienteOrcamentoDoc | null
    if (!doc) throw new DomainError(404, "Cliente não encontrado", "CLIENT_NOT_FOUND")
    if (doc.active === false) throw new DomainError(403, "Cliente desativado", "CLIENT_INACTIVE")
    return doc
}

/**
 * Cliente pedido explicitamente (header `x-client-id` ou query `?clientId=`), usado na
 * pré-visualização do dono.
 */
export function requestedClientId(req: NextRequest): string | null {
    const header = req.headers.get("x-client-id")
    if (header?.trim()) return header.trim()
    const query = req.nextUrl.searchParams.get("clientId")
    return query?.trim() || null
}

/**
 * Exige uma sessão com cliente selecionado e devolve o ator do portal (usuário + cliente + papel).
 * O dono (`kind: "admin"`) precisa indicar o cliente (`x-client-id`/`?clientId=`) e entra como
 * **pré-visualização** (admin).
 */
export async function requireClientActor(req: NextRequest): Promise<ClientActor> {
    const session = await sessionFromRequest(req)
    if (!session) throw new DomainError(401, "Sessão ausente ou expirada.", "UNAUTHENTICATED")

    if (session.kind === "admin") {
        const clientId = requestedClientId(req)
        if (!clientId) throw new DomainError(400, "Informe o cliente para pré-visualizar o portal.", "CLIENT_NOT_SELECTED")
        const client = await loadActiveClient(clientId)
        const owner = getLocalUser()
        return { userId: owner.id, displayName: owner.name, username: owner.name, email: null, client, isAdmin: true, preview: true }
    }

    const userId = session.userId!
    await dbConnect()
    const user = (await User.findById(userId).lean()) as UserDoc | null
    if (!user || user.active === false) throw new DomainError(401, "Usuário inativo ou removido.", "UNAUTHENTICATED")

    const clientId = session.clientId
    if (!clientId) throw new DomainError(409, "Escolha um cliente para continuar.", "CLIENT_NOT_SELECTED")
    const membership = (user.memberships ?? []).find((item) => item.clientId === clientId)
    if (!membership) throw new DomainError(403, "Você não tem acesso a este cliente.", "FORBIDDEN")

    const client = await loadActiveClient(clientId)
    return { userId: String(user._id), displayName: user.username, username: user.username, email: user.email ?? null, client, isAdmin: Boolean(membership.admin), preview: false }
}

/** Exige o **admin** do cliente em escopo (Financeiro e Usuários do portal). */
export function assertClientAdmin(actor: ClientActor): void {
    if (!actor.isAdmin) throw new DomainError(403, "Apenas administradores do cliente podem acessar.", "FORBIDDEN")
}

export interface PortalContext extends ClientActor {
    /** Clientes ativos do usuário (seletor de troca). */
    clients: ClienteSelectableDto[]
}

/** Todos os clientes ativos (pré-visualização do dono). */
export async function allActiveClients(): Promise<ClienteSelectableDto[]> {
    await dbConnect()
    const docs = await OrcamentoClient.find({ active: true }).select({ name: 1 }).sort({ name: 1 }).lean()
    return docs.map((doc) => ({ id: String(doc._id), name: doc.name, admin: true }))
}

/** Clientes ativos de um usuário pelo id (tela de escolha do portal). */
export async function userClientsById(userId: string): Promise<ClienteSelectableDto[]> {
    const user = await findActiveUser(userId)
    return user ? userClients(user) : []
}

/** Cliente em pré-visualização guardado no cookie (só faz sentido para o dono). */
export async function previewClientFromCookies(): Promise<string | null> {
    const store = await cookies()
    return store.get(PREVIEW_CLIENT_COOKIE)?.value ?? null
}

/**
 * Contexto do portal para Server Components (layout): resolve a sessão, o cliente selecionado e os
 * papéis. Devolve `null` quando a sessão não é de cliente (ex.: dono sem cliente escolhido).
 */
export async function resolvePortalContext(session: SessionPayload, clientId?: string | null): Promise<PortalContext | null> {
    if (session.kind === "admin") {
        if (!clientId) return null
        const client = await loadActiveClient(clientId)
        const owner = getLocalUser()
        return { userId: owner.id, displayName: owner.name, username: owner.name, email: null, client, isAdmin: true, preview: true, clients: await allActiveClients() }
    }

    const userId = session.userId!
    await dbConnect()
    const user = (await User.findById(userId).lean()) as UserDoc | null
    if (!user || user.active === false) return null

    const selected = clientId ?? session.clientId ?? null
    if (!selected) return null
    const membership = (user.memberships ?? []).find((item) => item.clientId === selected)
    if (!membership) return null
    const client = await OrcamentoClient.findOne({ _id: selected, active: true }).lean()
    if (!client) return null

    const clients = await userClients(user)
    return {
        userId: String(user._id),
        displayName: user.username,
        username: user.username,
        email: user.email ?? null,
        client: client as ClienteOrcamentoDoc,
        isAdmin: Boolean(membership.admin),
        preview: false,
        clients,
    }
}

/** Clientes ativos do usuário (para a tela de escolha e o seletor da sidebar). */
export async function userClients(user: UserDoc): Promise<ClienteSelectableDto[]> {
    const ids = (user.memberships ?? []).map((item) => item.clientId)
    if (ids.length === 0) return []
    await dbConnect()
    const docs = await OrcamentoClient.find({ _id: { $in: ids }, active: true })
        .select({ name: 1 })
        .lean()
    const byId = new Map(docs.map((doc) => [String(doc._id), doc.name]))
    return (user.memberships ?? [])
        .filter((item) => byId.has(item.clientId))
        .map((item) => ({ id: item.clientId, name: byId.get(item.clientId)!, admin: Boolean(item.admin) }))
}

/** Clientes disponíveis para o ator: os do usuário, ou todos (pré-visualização do dono). */
export async function actorClients(actor: ClientActor): Promise<ClienteSelectableDto[]> {
    if (actor.preview) return allActiveClients()
    const user = (await User.findById(actor.userId).lean()) as UserDoc | null
    return user ? userClients(user) : []
}

/** Usuário ativo pelo id (usado no layout do portal e nas rotas). */
export async function findActiveUser(userId: string): Promise<UserDoc | null> {
    if (!OBJECT_ID.test(userId)) return null
    await dbConnect()
    const user = (await User.findById(userId).lean()) as UserDoc | null
    return user && user.active !== false ? user : null
}

/**
 * Guarda das **páginas** restritas do portal (Financeiro e Usuários): exige o **admin** do cliente em
escopo; caso contrário, redireciona para o dashboard do portal.
 */
export async function requirePortalAdminPage(): Promise<PortalContext> {
    const session = await sessionFromCookies()
    const previewClient = session?.kind === "admin" ? await previewClientFromCookies() : null
    const context = session ? await resolvePortalContext(session, previewClient) : null
    if (!context || !context.isAdmin) redirect("/cliente")
    return context
}
