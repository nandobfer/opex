import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { AgentFile, type AgentFileKind, type IAgentFile, type IAgentFileOrigin } from "@/lib/db/models/AgentFile"
import { AcaoAuditoria, recordAudit } from "@/lib/audit/record"
import { getIntegrationConfig } from "@/lib/integrations/runtime"
import { loggerFor } from "@/lib/logger"
import { deleteFile, getFileObject, getFileUrl, getUploadUrl, headFile, storageErrorInfo, uploadFile } from "@/lib/storage/s3"
import {
    AGENT_DOCUMENTS_AUDIT_ENTITY,
    AGENT_DOCUMENT_LIMITS as L,
    AGENT_FILES_PREFIX,
    formatBytes,
    isInlineTextType,
    URL_TTL_DEFAULT_MINUTES,
    URL_TTL_MAX_DEFAULT_MINUTES,
    URL_TTL_SIGV4_MAX_MINUTES,
} from "../constants"
import type { AgentFileFilters } from "../schemas"

/**
 * Motor de arquivos dos agentes (OPE-210): guarda, lê e gera URLs temporárias **só** no espaço
 * `agent-files/` do bucket, com um registro por arquivo no catálogo `agent_files`.
 *
 * - A chave é gerada aqui (`agent-files/<id>/<nome>`) e conferida por `assertAgentKey` antes de cada
 *   operação no bucket; quem chama passa o id do catálogo, nunca uma chave. Anexos de tarefas, arquivos
 *   do chat, do portal e de clientes ficam fora de alcance.
 * - URLs (download e envio) usam o **Endpoint público** da integração Storage S3 (`audience: "browser"`),
 *   porque quem baixa ou envia pode estar fora do servidor (ex.: o navegador do Galaxy).
 * - Validade: "padrão" da integração Gotenberg (15 min) e, quando o agente pede outra, limitada à "máxima".
 */

export const agentDocsLog = loggerFor({ feature: "agent-documents" })

const KEY_PATTERN = /^agent-files\/[a-f0-9]{24}\/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/

/** Recusa toda chave fora do espaço dos agentes (prefixo e formato exatos). */
export function assertAgentKey(key: string): void {
    if (typeof key !== "string" || !key.startsWith(AGENT_FILES_PREFIX) || key.includes("..") || key.includes("\\") || /[\u0000-\u001f]/.test(key) || !KEY_PATTERN.test(key)) {
        throw new DomainError(403, "Chave fora do espaço dos arquivos dos agentes", "AGENT_FILE_KEY_FORBIDDEN")
    }
}

/** Nome seguro para a chave (sem acento, espaço nem barra), preservando a extensão. */
export function sanitizeFileName(name: string): string {
    const clean = name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/\.{2,}/g, ".")
        .replace(/-{2,}/g, "-")
        .replace(/^[-._]+/, "")
        .slice(0, 120)
    return clean || "arquivo"
}

export function buildAgentKey(id: Types.ObjectId | string, name: string): string {
    const key = `${AGENT_FILES_PREFIX}${String(id)}/${sanitizeFileName(name)}`
    assertAgentKey(key)
    return key
}

/** Validade das URLs (segundos) a partir do pedido do agente e dos campos da integração Gotenberg. */
export async function urlTtl(requestedMinutes?: number): Promise<{ seconds: number; expiresAt: Date }> {
    const config = await getIntegrationConfig("gotenberg").catch(() => null)
    const defaultMinutes = Number(config?.urlTtlMinutes) > 0 ? Number(config?.urlTtlMinutes) : URL_TTL_DEFAULT_MINUTES
    const maxMinutes = Math.min(URL_TTL_SIGV4_MAX_MINUTES, Number(config?.urlTtlMaxMinutes) > 0 ? Number(config?.urlTtlMaxMinutes) : URL_TTL_MAX_DEFAULT_MINUTES)
    const minutes = Math.max(1, Math.min(requestedMinutes ?? defaultMinutes, maxMinutes))
    return { seconds: minutes * 60, expiresAt: new Date(Date.now() + minutes * 60_000) }
}

// ---------------------------------------------------------------- DTO

export interface AgentFileDto {
    id: string
    nome: string
    tipo: string
    tamanho: number | null
    tamanhoLegivel: string | null
    paginas: number | null
    categoria: AgentFileKind
    status: "pronto" | "aguardando envio"
    origem: { tipo: string; agente: string | null; agenteId: string | null; execucao: string | null; ferramenta: string | null }
    metadados: Record<string, string>
    criadoEm: string
    arquivoPrincipal: string | null
    pdf?: { formato: string; orientacao: string; escala: number; coube: boolean; maxPaginas: number }
}

type AgentFileDoc = IAgentFile

function metadataOf(doc: AgentFileDoc): Record<string, string> {
    const raw = doc.metadata as unknown
    if (raw instanceof Map) return Object.fromEntries(raw as Map<string, string>)
    return { ...((raw as Record<string, string> | undefined) ?? {}) }
}

export function toAgentFileDto(doc: AgentFileDoc): AgentFileDto {
    return {
        id: String(doc._id),
        nome: doc.name,
        tipo: doc.mimeType,
        tamanho: doc.size ?? null,
        tamanhoLegivel: doc.size !== null && doc.size !== undefined ? formatBytes(doc.size) : null,
        paginas: doc.pages ?? null,
        categoria: doc.kind,
        status: doc.status === "pending" ? "aguardando envio" : "pronto",
        origem: { tipo: doc.origin.type, agente: doc.origin.agentName ?? null, agenteId: doc.origin.agentId ?? null, execucao: doc.origin.runId ?? null, ferramenta: doc.origin.tool ?? null },
        metadados: metadataOf(doc),
        criadoEm: new Date(doc.createdAt).toISOString(),
        arquivoPrincipal: doc.parentId ? String(doc.parentId) : null,
        ...(doc.pdf ? { pdf: { formato: doc.pdf.format, orientacao: doc.pdf.orientation, escala: doc.pdf.scale, coube: doc.pdf.fits, maxPaginas: doc.pdf.maxPages } } : {}),
    }
}

// ---------------------------------------------------------------- auditoria

async function audit(actorId: string, doc: AgentFileDoc, operation: "gravar" | "envio" | "ler", acao: (typeof AcaoAuditoria)[keyof typeof AcaoAuditoria]): Promise<void> {
    await recordAudit({
        userId: actorId,
        entidade: AGENT_DOCUMENTS_AUDIT_ENTITY,
        entidadeId: String(doc._id),
        acao,
        depois: { operacao: operation, nome: doc.name, tipo: doc.mimeType, tamanho: doc.size ?? null, categoria: doc.kind, origem: { ...doc.origin } },
    })
}

/** Auditoria de leitura (metadados e URLs entregues), sem conteúdo. */
export async function auditAgentFileRead(actorId: string, docs: readonly AgentFileDoc[], tool: string): Promise<void> {
    for (const doc of docs) await audit(actorId, doc, "ler", AcaoAuditoria.EXECUTAR)
    if (docs.length) agentDocsLog.info({ tool, ids: docs.map((doc) => String(doc._id)) }, "[agent-documents] arquivos lidos")
}

// ---------------------------------------------------------------- gravação

export interface SaveAgentFileInput {
    id?: Types.ObjectId
    name: string
    mimeType: string
    body: Buffer
    kind?: AgentFileKind
    origin: IAgentFileOrigin
    metadata?: Record<string, string>
    parentId?: Types.ObjectId | null
    pages?: number | null
    pdf?: IAgentFile["pdf"]
    resume?: IAgentFile["resume"]
    actorId: string
}

/** Remove do bucket um objeto que não chegou ao catálogo (falha logada, nunca lança). */
async function removeOrphan(key: string, id: Types.ObjectId): Promise<void> {
    await deleteFile(key).catch((error: unknown) => agentDocsLog.warn({ id: String(id), err: error instanceof Error ? error.message : String(error) }, "[agent-documents] falha ao remover objeto sem registro no catálogo"))
}

/**
 * Grava no bucket (chave gerada aqui) e registra no catálogo. Falha no bucket = nada no catálogo; falha no
 * catálogo = o objeto recém-enviado é removido do bucket (sem órfão em `agent-files/`).
 */
export async function saveAgentFile(input: SaveAgentFileInput): Promise<AgentFileDoc> {
    await dbConnect()
    const id = input.id ?? new Types.ObjectId()
    const key = buildAgentKey(id, input.name)
    await uploadFile(key, input.body, input.mimeType)
    const doc = await AgentFile.create({
        _id: id,
        name: input.name,
        mimeType: input.mimeType,
        size: input.body.length,
        pages: input.pages ?? null,
        key,
        kind: input.kind ?? "file",
        status: "ready",
        origin: input.origin,
        metadata: input.metadata ?? {},
        parentId: input.parentId ?? null,
        pdf: input.pdf ?? null,
        resume: input.resume ?? null,
    }).catch(async (error: unknown) => {
        await removeOrphan(key, id)
        throw error
    })
    const saved = doc.toObject() as AgentFileDoc
    await audit(input.actorId, saved, "gravar", AcaoAuditoria.CRIAR)
    agentDocsLog.info({ id: String(id), kind: saved.kind, bytes: saved.size, origin: saved.origin.type, tool: saved.origin.tool }, "[agent-documents] arquivo gravado")
    return saved
}

export async function setResumeLinks(id: Types.ObjectId, links: { htmlFileId: Types.ObjectId | null; pngFileId: Types.ObjectId | null }): Promise<void> {
    await AgentFile.updateOne({ _id: id }, { $set: { "resume.htmlFileId": links.htmlFileId, "resume.pngFileId": links.pngFileId } })
}

/** Decodifica o conteúdo do `upload_s3` (texto ou base64) conferindo o limite. */
export function decodeUploadContent(input: { texto?: string; base64?: string }): Buffer {
    let body: Buffer
    if (input.texto !== undefined) body = Buffer.from(input.texto, "utf8")
    else {
        const raw = (input.base64 ?? "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "")
        if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(raw)) throw new DomainError(400, "O base64 enviado é inválido", "AGENT_FILE_BASE64_INVALID")
        body = Buffer.from(raw, "base64")
    }
    if (body.length > L.uploadContentBytes)
        throw new DomainError(413, `O conteúdo tem ${formatBytes(body.length)}; o limite do envio direto é ${formatBytes(L.uploadContentBytes)}. Para arquivos maiores, use o modo url (envio pela URL).`, "AGENT_FILE_TOO_LARGE")
    return body
}

export interface PendingUpload {
    doc: AgentFileDoc
    uploadUrl: string
    expiresAt: Date
}

/** Registra um arquivo pendente e devolve a URL de envio (PUT) pelo Endpoint público. */
export async function createAgentFileUpload(input: { name: string; mimeType: string; size: number; origin: IAgentFileOrigin; metadata?: Record<string, string>; ttlMinutes?: number; actorId: string }): Promise<PendingUpload> {
    if (input.size > L.putUploadBytes) throw new DomainError(413, `O arquivo tem ${formatBytes(input.size)}; o limite do envio pela URL é ${formatBytes(L.putUploadBytes)}.`, "AGENT_FILE_TOO_LARGE")
    await dbConnect()
    const id = new Types.ObjectId()
    const key = buildAgentKey(id, input.name)
    const ttl = await urlTtl(input.ttlMinutes)
    const uploadUrl = await getUploadUrl(key, input.mimeType, ttl.seconds, "browser")
    const doc = await AgentFile.create({
        _id: id,
        name: input.name,
        mimeType: input.mimeType,
        size: null,
        key,
        kind: "file",
        status: "pending",
        origin: input.origin,
        metadata: input.metadata ?? {},
        upload: { maxBytes: Math.min(L.putUploadBytes, input.size), expiresAt: ttl.expiresAt },
    })
    const saved = doc.toObject() as AgentFileDoc
    await audit(input.actorId, saved, "envio", AcaoAuditoria.CRIAR)
    agentDocsLog.info({ id: String(id), declaredBytes: input.size, origin: saved.origin.type }, "[agent-documents] URL de envio gerada")
    return { doc: saved, uploadUrl, expiresAt: ttl.expiresAt }
}

/** A URL de envio ainda vale (um novo PUT pode trocar o objeto)? */
const uploadUrlAlive = (doc: AgentFileDoc, now = Date.now()) => Boolean(doc.upload?.expiresAt && new Date(doc.upload.expiresAt).getTime() > now)

/**
 * Finaliza um envio pela URL: confere o objeto no bucket (`headFile`), grava o tamanho e marca pronto.
 * Acima do limite declarado (ou do teto), o objeto é removido e o registro volta a pendente. Ainda
 * não enviado: continua pendente. Enquanto a URL de envio vale, um arquivo já pronto é conferido de novo a
 * cada leitura (outro PUT pode ter trocado o objeto): o tamanho do catálogo acompanha o real.
 */
export async function finalizePending(doc: AgentFileDoc): Promise<AgentFileDoc> {
    if (doc.status !== "pending" && !uploadUrlAlive(doc)) return doc
    assertAgentKey(doc.key)
    let head
    try {
        head = await headFile(doc.key)
    } catch (error) {
        if (storageErrorInfo(error).kind === "not_found") return doc
        throw error
    }
    const size = head.contentLength ?? 0
    const max = Math.min(L.putUploadBytes, doc.upload?.maxBytes ?? L.putUploadBytes)
    if (size > max) {
        await deleteFile(doc.key).catch((error: unknown) => agentDocsLog.warn({ id: String(doc._id), err: error instanceof Error ? error.message : String(error) }, "[agent-documents] falha ao remover envio acima do limite"))
        await AgentFile.updateOne({ _id: doc._id }, { $set: { status: "pending", size: null } })
        agentDocsLog.warn({ id: String(doc._id), bytes: size, max }, "[agent-documents] envio acima do limite removido")
        throw new DomainError(413, `O arquivo enviado tem ${formatBytes(size)}, acima do limite de ${formatBytes(max)}: ele foi removido. Gere outra URL de envio com o tamanho certo.`, "AGENT_FILE_TOO_LARGE")
    }
    if (doc.status === "ready" && doc.size === size) return doc
    // A URL de envio continua em `upload` até expirar, para a próxima leitura conferir de novo.
    const updated = await AgentFile.findOneAndUpdate({ _id: doc._id }, { $set: { status: "ready", size } }, { new: true }).lean<AgentFileDoc>()
    return updated ?? { ...doc, status: "ready", size }
}

// ---------------------------------------------------------------- leitura

export async function agentFileDownloadUrl(doc: AgentFileDoc, ttlSeconds: number): Promise<string> {
    assertAgentKey(doc.key)
    return getFileUrl(doc.key, { audience: "browser", expiresIn: ttlSeconds, downloadName: doc.name })
}

/** Conteúdo de texto pequeno (até o limite inline); `null` para binário ou arquivo grande. */
export async function readAgentFileText(doc: AgentFileDoc): Promise<string | null> {
    if (doc.status !== "ready" || !isInlineTextType(doc.mimeType) || (doc.size ?? Infinity) > L.inlineTextBytes) return null
    assertAgentKey(doc.key)
    const object = await getFileObject(doc.key)
    if (!object.body) return null
    // O tamanho real manda (o catálogo pode estar desatualizado): acima do limite, não lê o corpo.
    if (object.contentLength === undefined || object.contentLength > L.inlineTextBytes) {
        await object.body.cancel().catch(() => undefined)
        if (object.contentLength !== undefined && object.contentLength !== doc.size) await AgentFile.updateOne({ _id: doc._id }, { $set: { size: object.contentLength } })
        return null
    }
    const text = await new Response(object.body).text()
    return Buffer.byteLength(text) > L.inlineTextBytes ? null : text
}

export async function getAgentFile(id: string): Promise<AgentFileDoc> {
    await dbConnect()
    const doc = Types.ObjectId.isValid(id) ? await AgentFile.findById(id).lean<AgentFileDoc>() : null
    if (!doc) throw new DomainError(404, "Arquivo não encontrado no catálogo dos agentes", "AGENT_FILE_NOT_FOUND")
    return doc
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Consulta do catálogo (puro: exportado para os testes). */
export interface AgentFileScope {
    kind?: AgentFileKind | AgentFileKind[]
    mimeType?: string
    /** Metadados por padrão (ex.: empresa sem diferenciar maiúsculas, parte da vaga). */
    metadataPatterns?: Record<string, RegExp>
}

export const exactInsensitive = (value: string) => new RegExp(`^${escapeRegex(value)}$`, "i")
export const containsInsensitive = (value: string) => new RegExp(escapeRegex(value), "i")

export function agentFileQuery(filters: AgentFileFilters, extra: AgentFileScope = {}): Record<string, unknown> {
    const query: Record<string, unknown> = {}
    if (extra.kind) query.kind = Array.isArray(extra.kind) ? { $in: extra.kind } : extra.kind
    if (extra.mimeType) query.mimeType = extra.mimeType
    const agent = filters.origem?.agente
    if (agent) query.$or = Types.ObjectId.isValid(agent) && /^[a-f0-9]{24}$/.test(agent) ? [{ "origin.agentId": agent }] : [{ "origin.agentName": new RegExp(`^${escapeRegex(agent)}$`, "i") }]
    if (filters.origem?.execucao) query["origin.runId"] = filters.origem.execucao
    if (filters.origem?.ferramenta) query["origin.tool"] = filters.origem.ferramenta
    for (const [key, value] of Object.entries(filters.metadados ?? {})) query[`metadata.${key}`] = value
    for (const [key, pattern] of Object.entries(extra.metadataPatterns ?? {})) query[`metadata.${key}`] = pattern
    if (filters.nome) query.name = new RegExp(escapeRegex(filters.nome), "i")
    const created: Record<string, Date> = {}
    if (filters.de) created.$gte = new Date(filters.de)
    if (filters.ate) {
        const end = new Date(filters.ate)
        // Só a data (AAAA-MM-DD): inclui o dia inteiro.
        if (/^\d{4}-\d{2}-\d{2}$/.test(filters.ate.trim())) end.setUTCHours(23, 59, 59, 999)
        created.$lte = end
    }
    if (Object.keys(created).length) query.createdAt = created
    return query
}

export async function findAgentFiles(filters: AgentFileFilters, extra: AgentFileScope = {}): Promise<AgentFileDoc[]> {
    await dbConnect()
    const limit = Math.min(L.searchMax, filters.limite ?? L.searchDefault)
    return AgentFile.find(agentFileQuery(filters, extra)).sort({ createdAt: -1 }).limit(limit).lean<AgentFileDoc[]>()
}

export async function findAgentFilesByIds(ids: readonly (Types.ObjectId | null | undefined)[]): Promise<Map<string, AgentFileDoc>> {
    const valid = ids.filter((id): id is Types.ObjectId => Boolean(id))
    if (!valid.length) return new Map()
    const docs = await AgentFile.find({ _id: { $in: valid } }).lean<AgentFileDoc[]>()
    return new Map(docs.map((doc) => [String(doc._id), doc]))
}

export interface AgentFileWithUrl extends AgentFileDto {
    url: string | null
    expiraEm: string | null
    conteudo?: string | null
}

/** DTO com URL nova (só para arquivo pronto) e, quando pedido, o texto inline. */
export async function withDownload(doc: AgentFileDoc, ttl: { seconds: number; expiresAt: Date }, options: { content?: boolean } = {}): Promise<AgentFileWithUrl> {
    const ready = doc.status === "ready"
    const dto: AgentFileWithUrl = { ...toAgentFileDto(doc), url: ready ? await agentFileDownloadUrl(doc, ttl.seconds) : null, expiraEm: ready ? ttl.expiresAt.toISOString() : null }
    if (options.content) dto.conteudo = ready ? await readAgentFileText(doc) : null
    return dto
}

/** Busca por id ou filtros, finalizando os envios pendentes encontrados. */
export async function lookupAgentFiles(input: AgentFileFilters & { id?: string }, extra: AgentFileScope = {}): Promise<AgentFileDoc[]> {
    const docs = input.id ? [await getAgentFile(input.id)] : await findAgentFiles(input, extra)
    if (input.id) {
        const doc = docs[0]!
        const kinds = extra.kind ? (Array.isArray(extra.kind) ? extra.kind : [extra.kind]) : null
        if ((kinds && !kinds.includes(doc.kind)) || (extra.mimeType && doc.mimeType !== extra.mimeType))
            throw new DomainError(404, `O id ${input.id} não é de ${kinds?.includes("resume") ? "um currículo" : "um PDF"} do catálogo`, "AGENT_FILE_NOT_FOUND")
    }
    return Promise.all(docs.map((doc) => finalizePending(doc)))
}
