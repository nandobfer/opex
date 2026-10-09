import { createHash, randomBytes } from "node:crypto"
import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { recordAudit } from "@/lib/audit/record"
import { dbConnect } from "@/lib/db"
import { ApiToken, type IApiToken } from "@/lib/db/models/ApiToken"
import { createAuditContext } from "@/lib/db/plugins/audit.plugin"
import type { ApiTokenInput } from "./schemas"
import type { ApiTokenDto, CreatedApiTokenDto } from "./types"

/**
 * Tokens de sistema da API interna (Integrações › API interna): gerar (o valor aparece uma vez),
 * listar (só prefixo e metadados), revogar e autenticar. Hash SHA-256 no banco.
 */

export const API_TOKEN_PREFIX = "mt_sys_"
export const API_TOKEN_AUDIT_ENTITY = "TokenApiInterna"
/** Atualizar "último uso" no máximo a cada 5 min (não escreve a cada chamada). */
const LAST_USE_THROTTLE_MS = 5 * 60_000

export const hashApiToken = (token: string) => createHash("sha256").update(token).digest("hex")

/** Valor novo (`mt_sys_…`), o prefixo visível e o hash que vai para o banco. */
export function newApiTokenValue(): { token: string; prefixo: string; hash: string } {
    const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`
    return { token, prefixo: token.slice(0, API_TOKEN_PREFIX.length + 8), hash: hashApiToken(token) }
}

function toDto(token: IApiToken): ApiTokenDto {
    return {
        id: String(token._id),
        nome: token.nome,
        prefixo: token.prefixo,
        criadoEm: new Date(token.createdAt ?? Date.now()).toISOString(),
        ultimoUsoEm: token.ultimoUsoEm ? new Date(token.ultimoUsoEm).toISOString() : null,
    }
}

const notFound = () => new DomainError(404, "Token não encontrado")

export async function listApiTokens(): Promise<ApiTokenDto[]> {
    await dbConnect()
    const rows = (await ApiToken.find({ revogadoEm: null }).sort({ createdAt: -1 }).lean()) as IApiToken[]
    return rows.map(toDto)
}

export async function createApiToken(actorId: string, input: ApiTokenInput): Promise<CreatedApiTokenDto> {
    await dbConnect()
    const { token, prefixo, hash } = newApiTokenValue()
    const doc = new ApiToken({ nome: input.nome.trim(), prefixo, hash })
    doc.set("_auditContext", createAuditContext(actorId))
    await doc.save()
    await recordAudit({ userId: actorId, entidade: API_TOKEN_AUDIT_ENTITY, entidadeId: String(doc._id), acao: "CRIAR", depois: { nome: doc.nome, prefixo } })
    return { token, item: toDto(doc.toObject() as IApiToken) }
}

export async function revokeApiToken(actorId: string, tokenId: string): Promise<void> {
    await dbConnect()
    if (!Types.ObjectId.isValid(tokenId)) throw notFound()
    const current = await ApiToken.findOneAndUpdate(
        { _id: tokenId, revogadoEm: null },
        { $set: { revogadoEm: new Date() }, _auditContext: createAuditContext(actorId) },
    ).lean()
    if (!current) throw notFound()
    await recordAudit({ userId: actorId, entidade: API_TOKEN_AUDIT_ENTITY, entidadeId: tokenId, acao: "EXCLUIR", antes: { nome: current.nome, prefixo: current.prefixo } })
}

/** Token válido (não revogado) do `Authorization: Bearer mt_sys_…`, ou `null`. */
export async function authenticateApiToken(authorization: string | null, now: Date = new Date()): Promise<ApiTokenDto | null> {
    if (!authorization?.startsWith("Bearer ")) return null
    const raw = authorization.slice(7).trim()
    if (!raw.startsWith(API_TOKEN_PREFIX)) return null
    await dbConnect()
    const token = (await ApiToken.findOne({ hash: hashApiToken(raw), revogadoEm: null }).lean()) as IApiToken | null
    if (!token) return null
    if (!token.ultimoUsoEm || now.getTime() - new Date(token.ultimoUsoEm).getTime() > LAST_USE_THROTTLE_MS) {
        await ApiToken.updateOne({ _id: token._id }, { $set: { ultimoUsoEm: now } })
    }
    return toDto(token)
}

/**
 * Exige um token de sistema válido. Para os endpoints PÚBLICOS da API interna (documentados em
 * `src/features/public-api/openapi/spec.ts`). 401 sem token ou token inválido/revogado.
 */
export async function requireApiToken(request: Request): Promise<ApiTokenDto> {
    const token = await authenticateApiToken(request.headers.get("authorization"))
    if (!token) throw new DomainError(401, "Token ausente, inválido ou revogado", "UNAUTHENTICATED")
    return token
}
