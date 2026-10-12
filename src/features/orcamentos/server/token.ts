import { createHash, randomBytes } from "node:crypto"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { OrcamentoClient, type IOrcamentoClient } from "@/lib/db/models/Orcamento"
import { User, type IUser } from "@/lib/db/models/User"
import { CLIENT_TOKEN_PREFIX, CLIENTE_TOKEN_PARAM, USER_TOKEN_PREFIX } from "../constants"

/**
 * Tokens de acesso (SOMENTE servidor). Servem para **estabelecer a sessão** por URL: o cliente tem o
 * token do portal (`cli_…`) e cada usuário de cliente pode ter o seu (`usr_…`). O valor aparece uma
 * única vez ao criar/regenerar; o banco guarda só o hash SHA-256 e o prefixo visível.
 */

export const hashClientToken = (token: string) => createHash("sha256").update(token).digest("hex")

/** Gera um token com o prefixo dado (`cli_`/`usr_`). */
export function newTokenValue(prefix: string): { token: string; prefix: string; hash: string } {
    const token = `${prefix}${randomBytes(24).toString("base64url")}`
    return { token, prefix: token.slice(0, prefix.length + 8), hash: hashClientToken(token) }
}

export function newClientTokenValue(): { token: string; prefix: string; hash: string } {
    return newTokenValue(CLIENT_TOKEN_PREFIX)
}

export function newUserTokenValue(): { token: string; prefix: string; hash: string } {
    return newTokenValue(USER_TOKEN_PREFIX)
}

type ClientDoc = IOrcamentoClient & { _id: unknown }
export type UserDoc = IUser & { _id: unknown }

/** Documento do cliente (com `_id`) usado pelos serviços do portal. */
export type ClienteOrcamentoDoc = ClientDoc

/** Cliente ativo do token, ou `null`. */
export async function findClientByToken(token: string | null | undefined): Promise<ClientDoc | null> {
    if (!token || !token.startsWith(CLIENT_TOKEN_PREFIX)) return null
    await dbConnect()
    const found = (await OrcamentoClient.findOne({ tokenHash: hashClientToken(token), active: true }).lean()) as ClientDoc | null
    return found ?? null
}

/** Usuário ativo do token próprio (`usr_…`), ou `null`. */
export async function findUserByToken(token: string | null | undefined): Promise<UserDoc | null> {
    if (!token || !token.startsWith(USER_TOKEN_PREFIX)) return null
    await dbConnect()
    return (await User.findOne({ tokenHash: hashClientToken(token), active: true }).lean()) as UserDoc | null
}

/** Usuário **padrão** de um cliente (o que usa o token do cliente), ou `null`. */
export async function findDefaultUser(clientId: string): Promise<UserDoc | null> {
    await dbConnect()
    return (await User.findOne({ defaultForClientId: clientId, active: true }).lean()) as UserDoc | null
}

/**
 * Resolve um token de portal para o usuário correspondente: token próprio (`usr_…`) ou token do
 * cliente (`cli_…`, que aponta para o usuário padrão). `null` quando não há correspondência.
 */
export async function resolveUserByToken(token: string | null | undefined): Promise<UserDoc | null> {
    const viaUser = await findUserByToken(token)
    if (viaUser) return viaUser
    const client = await findClientByToken(token)
    if (client) return findDefaultUser(String(client._id))
    return null
}

/** Token do portal: `x-client-token` (preferido) ou `?t=`. */
export function clientTokenFromRequest(request: Request): string | null {
    const header = request.headers.get("x-client-token")
    if (header) return header.trim()
    try {
        return new URL(request.url).searchParams.get(CLIENTE_TOKEN_PARAM)
    } catch {
        return null
    }
}

/** Exige um cliente ativo; 401 sem token ou token inválido. (Autenticação por token — legado/testes.) */
export async function requireClient(request: Request): Promise<ClientDoc> {
    const client = await findClientByToken(clientTokenFromRequest(request))
    if (!client) throw new DomainError(401, "Token do cliente ausente, inválido ou desativado", "UNAUTHENTICATED")
    return client
}
