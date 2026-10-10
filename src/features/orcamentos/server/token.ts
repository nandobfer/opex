import { createHash, randomBytes } from "node:crypto"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { OrcamentoClient, type IOrcamentoClient } from "@/lib/db/models/Orcamento"
import { CLIENT_TOKEN_PREFIX, CLIENTE_TOKEN_PARAM } from "../constants"

/**
 * Token de acesso ao portal do cliente (SOMENTE servidor). O valor (`cli_…`) aparece uma única vez
 * ao criar/regenerar; o banco guarda só o hash SHA-256 e o prefixo visível. A página do portal
 * recebe o token pela query `?t=` e as APIs pelo header `x-client-token` (ou `?t=`).
 */

export const hashClientToken = (token: string) => createHash("sha256").update(token).digest("hex")

export function newClientTokenValue(): { token: string; prefix: string; hash: string } {
    const token = `${CLIENT_TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`
    return { token, prefix: token.slice(0, CLIENT_TOKEN_PREFIX.length + 8), hash: hashClientToken(token) }
}

type ClientDoc = IOrcamentoClient & { _id: unknown }

/** Documento do cliente (com `_id`) usado pelos serviços do portal. */
export type ClienteOrcamentoDoc = ClientDoc

/** Cliente ativo do token, ou `null`. */
export async function findClientByToken(token: string | null | undefined): Promise<ClientDoc | null> {
    if (!token || !token.startsWith(CLIENT_TOKEN_PREFIX)) return null
    await dbConnect()
    const found = (await OrcamentoClient.findOne({ tokenHash: hashClientToken(token), active: true }).lean()) as ClientDoc | null
    return found ?? null
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

/** Exige um cliente ativo; 401 sem token ou token inválido. */
export async function requireClient(request: Request): Promise<ClientDoc> {
    const client = await findClientByToken(clientTokenFromRequest(request))
    if (!client) throw new DomainError(401, "Token do cliente ausente, inválido ou desativado", "UNAUTHENTICATED")
    return client
}
