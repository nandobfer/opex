import { createHash, randomBytes } from "node:crypto"
import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { recordAudit } from "@/lib/audit/record"
import { dbConnect } from "@/lib/db"
import { ApiToken, type IApiToken } from "@/lib/db/models/ApiToken"
import { createAuditContext } from "@/lib/db/plugins/audit.plugin"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { API_TOKENS_UPDATED_EVENT } from "./events"
import type { ApiTokenInput, ApiTokenUpdateInput } from "./schemas"
import { PUBLIC_TOKEN_ROUTES } from "@/features/public-api/routes"
import { API_SCOPE_ALL, effectiveScopes, groupOfScope, isApiScope, isGroupScope, isToolScope, routeAllowed, toolOfScope } from "./scopes"
import type { ApiTokenDto, CreatedApiTokenDto } from "./types"

/**
 * Tokens de sistema da API interna (Integrações › API interna): gerar (o valor aparece uma vez),
 * listar (só prefixo e metadados), editar escopos, revogar e autenticar. Hash SHA-256 no banco.
 */

export const API_TOKEN_PREFIX = "mt_sys_"
export const API_TOKEN_AUDIT_ENTITY = "TokenApiInterna"
export { API_TOKENS_UPDATED_EVENT }
/** Atualizar "último uso" no máximo a cada 5 min (não escreve a cada chamada). */
const LAST_USE_THROTTLE_MS = 5 * 60_000

const log = loggerFor({ module: "api-tokens" })

export const hashApiToken = (token: string) => createHash("sha256").update(token).digest("hex")

/** Valor novo (`mt_sys_…`), o prefixo visível e o hash que vai para o banco. */
export function newApiTokenValue(): { token: string; prefixo: string; hash: string } {
    const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`
    return { token, prefixo: token.slice(0, API_TOKEN_PREFIX.length + 8), hash: hashApiToken(token) }
}

const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null)

function toDto(token: IApiToken, now: Date = new Date()): ApiTokenDto {
    const { scopes, legacy } = effectiveScopes(token.escopos)
    const expiraEm = iso(token.expiraEm)
    return {
        id: String(token._id),
        nome: token.nome,
        prefixo: token.prefixo,
        criadoEm: new Date(token.createdAt ?? Date.now()).toISOString(),
        ultimoUsoEm: iso(token.ultimoUsoEm),
        escopos: scopes,
        legado: legacy,
        expiraEm,
        expirado: expiraEm !== null && new Date(expiraEm).getTime() <= now.getTime(),
    }
}

const notFound = () => new DomainError(404, "Token não encontrado")
const expiryOf = (value: string | null | undefined) => (value ? new Date(value) : null)

/** Rota da v1 fora de `PUBLIC_TOKEN_ROUTES`, ferramenta ou grupo fora do catálogo do MCP do dono → 400 (curingas seguem dinâmicos). */
export async function assertKnownScopes(scopes: readonly string[]): Promise<void> {
    const routeScopes = new Set<string>(PUBLIC_TOKEN_ROUTES.flatMap((route) => (route.scope ? [route.scope] : [])))
    const unknownRoute = scopes.find((scope) => isApiScope(scope) && scope !== API_SCOPE_ALL && !routeScopes.has(scope))
    if (unknownRoute) throw new DomainError(400, `Escopo de rota desconhecido: ${unknownRoute}`, "API_TOKEN_SCOPE_UNKNOWN")
    const tools = scopes.filter(isToolScope).map(toolOfScope)
    const groups = scopes.filter(isGroupScope).map(groupOfScope)
    if (!tools.length && !groups.length) return
    const { apiTokenScopeCatalog } = await import("./scope-catalog")
    const catalog = await apiTokenScopeCatalog()
    const unknownTool = tools.find((name) => !catalog.tools.some((tool) => tool.name === name))
    if (unknownTool) throw new DomainError(400, `Ferramenta desconhecida ou indisponível por token: ${unknownTool}`, "API_TOKEN_SCOPE_UNKNOWN")
    const unknownGroup = groups.find((id) => !catalog.groups.some((group) => group.id === id))
    if (unknownGroup) throw new DomainError(400, `Grupo de ferramentas desconhecido ou indisponível por token: ${unknownGroup}`, "API_TOKEN_SCOPE_UNKNOWN")
}

async function notify(id: string) {
    await publishAppEvent(API_TOKENS_UPDATED_EVENT, { id }).catch((error: unknown) => log.warn({ err: error instanceof Error ? error.message : error }, "[api-tokens] evento de tempo real não publicado"))
}

export async function listApiTokens(): Promise<ApiTokenDto[]> {
    await dbConnect()
    const rows = (await ApiToken.find({ revogadoEm: null }).sort({ createdAt: -1 }).lean()) as IApiToken[]
    const now = new Date()
    return rows.map((row) => toDto(row, now))
}

export async function createApiToken(actorId: string, input: ApiTokenInput): Promise<CreatedApiTokenDto> {
    await dbConnect()
    const escopos = [...new Set(input.escopos)]
    await assertKnownScopes(escopos)
    const { token, prefixo, hash } = newApiTokenValue()
    const expiraEm = expiryOf(input.expiraEm)
    const doc = new ApiToken({ nome: input.nome.trim(), prefixo, hash, escopos, expiraEm })
    doc.set("_auditContext", createAuditContext(actorId))
    await doc.save()
    await recordAudit({ userId: actorId, entidade: API_TOKEN_AUDIT_ENTITY, entidadeId: String(doc._id), acao: "CRIAR", depois: { nome: doc.nome, prefixo, escopos, expiraEm: iso(expiraEm) } })
    await notify(String(doc._id))
    return { token, item: toDto(doc.toObject() as IApiToken) }
}

/** Troca os escopos (e a expiração) de um token ativo; vale na próxima chamada. O valor não muda. */
export async function updateApiTokenScopes(actorId: string, tokenId: string, input: ApiTokenUpdateInput): Promise<ApiTokenDto> {
    await dbConnect()
    if (!Types.ObjectId.isValid(tokenId)) throw notFound()
    const escopos = [...new Set(input.escopos)]
    await assertKnownScopes(escopos)
    const expiraEm = expiryOf(input.expiraEm)
    const before = (await ApiToken.findOneAndUpdate(
        { _id: tokenId, revogadoEm: null },
        { $set: { escopos, expiraEm }, _auditContext: createAuditContext(actorId) },
    ).lean()) as IApiToken | null
    if (!before) throw notFound()
    const previous = effectiveScopes(before.escopos)
    await recordAudit({
        userId: actorId,
        entidade: API_TOKEN_AUDIT_ENTITY,
        entidadeId: tokenId,
        acao: "ATUALIZAR",
        antes: { nome: before.nome, prefixo: before.prefixo, escopos: previous.scopes, legado: previous.legacy, expiraEm: iso(before.expiraEm) },
        depois: { nome: before.nome, prefixo: before.prefixo, escopos, expiraEm: iso(expiraEm) },
    })
    await notify(tokenId)
    return toDto({ ...before, escopos, expiraEm } as IApiToken)
}

export async function revokeApiToken(actorId: string, tokenId: string): Promise<void> {
    await dbConnect()
    if (!Types.ObjectId.isValid(tokenId)) throw notFound()
    const current = (await ApiToken.findOneAndUpdate(
        { _id: tokenId, revogadoEm: null },
        { $set: { revogadoEm: new Date() }, _auditContext: createAuditContext(actorId) },
    ).lean()) as IApiToken | null
    if (!current) throw notFound()
    await recordAudit({
        userId: actorId,
        entidade: API_TOKEN_AUDIT_ENTITY,
        entidadeId: tokenId,
        acao: "EXCLUIR",
        antes: { nome: current.nome, prefixo: current.prefixo, escopos: effectiveScopes(current.escopos).scopes, expiraEm: iso(current.expiraEm) },
    })
    await notify(tokenId)
}

/** Token válido (não revogado nem expirado) do `Authorization: Bearer mt_sys_…`, ou `null`. */
export async function authenticateApiToken(authorization: string | null, now: Date = new Date()): Promise<ApiTokenDto | null> {
    if (!authorization?.startsWith("Bearer ")) return null
    const raw = authorization.slice(7).trim()
    if (!raw.startsWith(API_TOKEN_PREFIX)) return null
    await dbConnect()
    const token = (await ApiToken.findOne({ hash: hashApiToken(raw), revogadoEm: null }).lean()) as IApiToken | null
    if (!token) return null
    if (token.expiraEm && new Date(token.expiraEm).getTime() <= now.getTime()) {
        log.info({ tokenId: String(token._id), nome: token.nome, prefixo: token.prefixo }, "[api-tokens] token expirado recusado")
        return null
    }
    if (!token.ultimoUsoEm || now.getTime() - new Date(token.ultimoUsoEm).getTime() > LAST_USE_THROTTLE_MS) {
        await ApiToken.updateOne({ _id: token._id }, { $set: { ultimoUsoEm: now } })
    }
    return toDto(token, now)
}

/** Identificação do token para logs (nunca o valor). */
export const tokenLogRef = (token: Pick<ApiTokenDto, "id" | "nome" | "prefixo">) => ({ tokenId: token.id, tokenNome: token.nome, tokenPrefixo: token.prefixo })

export const UNAUTHENTICATED_MESSAGE = "Token ausente, inválido, revogado ou expirado"
export const insufficientScopeMessage = (required: string) => `Este token não tem o escopo ${required}. Edite os escopos em Integrações › API interna.`

/**
 * Exige um token de sistema válido. Para os endpoints PÚBLICOS da API interna (documentados em
 * `src/features/public-api/openapi/spec.ts`, escopo de cada rota em `PUBLIC_TOKEN_ROUTES`).
 * 401 sem token ou token inválido/revogado/expirado; 403 `INSUFFICIENT_SCOPE` sem o escopo da rota.
 */
export async function requireApiToken(request: Request, options: { scope?: string | null } = {}): Promise<ApiTokenDto> {
    const token = await authenticateApiToken(request.headers.get("authorization"))
    if (!token) throw new DomainError(401, UNAUTHENTICATED_MESSAGE, "UNAUTHENTICATED")
    const required = options.scope ?? null
    if (!routeAllowed(token.escopos, required)) {
        log.warn({ ...tokenLogRef(token), required, path: new URL(request.url).pathname }, "[api-tokens] escopo insuficiente")
        throw new DomainError(403, insufficientScopeMessage(required as string), "INSUFFICIENT_SCOPE", { required })
    }
    return token
}
