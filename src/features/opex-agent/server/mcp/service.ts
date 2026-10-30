import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { OpexMcpServer, type IOpexMcpSecret, type IOpexMcpServer } from "@/lib/db/models/Opex"
import { OrcamentoClient } from "@/lib/db/models/Orcamento"
import { decryptSecret, encryptSecret, isEncryptedSecret, isSecretBoxConfigured } from "@/lib/crypto/secretBox"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import {
    OPEX_MCP_AUDIT_ENTITY,
    OPEX_MCP_EVENT,
    nextMcpConfirmations,
    safeMcpUrl,
    type OpexMcpSecretEntry,
    type OpexMcpServerDto,
    type OpexMcpServerInput,
    type OpexMcpTestInput,
    type OpexMcpTestResultDto,
    type OpexMcpToolInfo,
} from "../../mcp"
import { closeMcp, connectMcp, describeMcpError, listMcpTools, toolInfosOf, type McpConnection } from "./connect"

/**
 * Cadastro dos MCPs do Agente Opex (SOMENTE servidor). Headers e variáveis de ambiente ficam cifrados
 * com `secretBox` e nunca saem no DTO (só as chaves). Mutações auditam (`McpServidor`, sem segredos) e
 * publicam `opex-mcp-updated` em `private-app`.
 */

const log = loggerFor({ module: "opex-agent-mcp" })

type ServerDoc = IOpexMcpServer & { _id: Types.ObjectId }

function assertId(id: string): void {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, "MCP não encontrado", "OPEX_MCP_NOT_FOUND")
}

async function loadDoc(id: string): Promise<ServerDoc> {
    assertId(id)
    await dbConnect()
    const doc = await OpexMcpServer.findById(id).lean<ServerDoc>()
    if (!doc) throw new DomainError(404, "MCP não encontrado", "OPEX_MCP_NOT_FOUND")
    return doc
}

/** Quantos clientes do portal têm cada MCP liberado. */
async function clientCounts(): Promise<Map<string, number>> {
    const clients = await OrcamentoClient.find({ "opexAgent.enabledMcpServers.0": { $exists: true } })
        .select({ "opexAgent.enabledMcpServers": 1 })
        .lean<{ opexAgent?: { enabledMcpServers?: string[] } }[]>()
    const counts = new Map<string, number>()
    for (const client of clients) for (const id of new Set(client.opexAgent?.enabledMcpServers ?? [])) counts.set(id, (counts.get(id) ?? 0) + 1)
    return counts
}

const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null)

export function toMcpServerDto(doc: ServerDoc, clientCount = 0): OpexMcpServerDto {
    return {
        id: String(doc._id),
        name: doc.name,
        slug: doc.slug,
        description: doc.description ?? "",
        enabled: doc.enabled !== false,
        transport: doc.transport,
        url: doc.url ?? "",
        command: doc.command ?? "",
        args: doc.args ?? [],
        headers: (doc.headers ?? []).map((entry) => ({ key: entry.key, configured: isEncryptedSecret(entry.value) })),
        env: (doc.env ?? []).map((entry) => ({ key: entry.key, configured: isEncryptedSecret(entry.value) })),
        confirmations: doc.confirmations ?? {},
        tools: doc.tools ?? [],
        toolsSyncedAt: iso(doc.toolsSyncedAt),
        lastError: doc.lastError ?? null,
        lastCheckedAt: iso(doc.lastCheckedAt),
        clientCount,
        createdAt: iso(doc.createdAt) ?? new Date(0).toISOString(),
        updatedAt: iso(doc.updatedAt) ?? new Date(0).toISOString(),
    }
}

export async function listMcpServers(): Promise<OpexMcpServerDto[]> {
    await dbConnect()
    const [docs, counts] = await Promise.all([OpexMcpServer.find().sort({ name: 1 }).lean<ServerDoc[]>(), clientCounts()])
    return docs.map((doc) => toMcpServerDto(doc, counts.get(String(doc._id)) ?? 0))
}

export async function getMcpServer(id: string): Promise<OpexMcpServerDto> {
    const doc = await loadDoc(id)
    return toMcpServerDto(doc, (await clientCounts()).get(id) ?? 0)
}

/** MCPs habilitados (opcionalmente só os ids informados), para o turno do agente. */
export async function loadEnabledMcpServers(ids?: readonly string[]): Promise<ServerDoc[]> {
    await dbConnect()
    if (ids && !ids.length) return []
    const filter = ids ? { enabled: true, _id: { $in: ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id)) } } : { enabled: true }
    return OpexMcpServer.find(filter).sort({ name: 1 }).lean<ServerDoc[]>()
}

export async function existingMcpServerIds(ids: readonly string[]): Promise<string[]> {
    const valid = ids.filter((id) => Types.ObjectId.isValid(id))
    if (!valid.length) return []
    await dbConnect()
    const docs = await OpexMcpServer.find({ _id: { $in: valid.map((id) => new Types.ObjectId(id)) } }).select({ _id: 1 }).lean<{ _id: Types.ObjectId }[]>()
    return docs.map((doc) => String(doc._id))
}

/** Lista final de segredos: valor novo cifrado; vazio mantém o salvo da mesma chave. */
export function mergeMcpSecrets(entries: readonly OpexMcpSecretEntry[], existing: readonly IOpexMcpSecret[], label: string): IOpexMcpSecret[] {
    const saved = new Map(existing.map((entry) => [entry.key, entry]))
    return entries.map((entry) => {
        if (entry.value) {
            if (!isSecretBoxConfigured()) throw new DomainError(400, "Defina INTEGRATIONS_ENCRYPTION_KEY no servidor para gravar segredos de MCP.", "OPEX_MCP_ENCRYPTION_MISSING")
            return { key: entry.key, value: encryptSecret(entry.value) }
        }
        const kept = saved.get(entry.key)
        if (!kept) throw new DomainError(400, `Informe o valor de ${label} "${entry.key}".`, "OPEX_MCP_SECRET_REQUIRED")
        return kept
    })
}

function plainSecrets(entries: readonly IOpexMcpSecret[]): Record<string, string> {
    const out: Record<string, string> = {}
    for (const entry of entries) {
        if (!isEncryptedSecret(entry.value)) continue
        try {
            out[entry.key] = decryptSecret(entry.value)
        } catch {
            throw new DomainError(400, `O valor salvo de "${entry.key}" não pôde ser lido com a chave atual; defina-o novamente.`, "OPEX_MCP_SECRET_UNREADABLE")
        }
    }
    return out
}

/** Conexão pronta (segredos decifrados) — nunca sai do servidor. */
export function mcpConnectionOf(doc: Pick<IOpexMcpServer, "transport" | "url" | "command" | "args" | "headers" | "env">): McpConnection {
    return {
        transport: doc.transport,
        url: doc.url ?? "",
        command: doc.command ?? "",
        args: doc.args ?? [],
        headers: doc.transport === "stdio" ? {} : plainSecrets(doc.headers ?? []),
        env: doc.transport === "stdio" ? plainSecrets(doc.env ?? []) : {},
    }
}

/** Resumo auditado: sem segredos, sem args (podem levar tokens) e sem query na URL. */
function auditSnapshot(doc: Pick<IOpexMcpServer, "name" | "slug" | "enabled" | "transport" | "url" | "command" | "args" | "headers" | "env" | "confirmations">): Record<string, unknown> {
    return {
        nome: doc.name,
        identificador: doc.slug,
        habilitado: doc.enabled,
        transporte: doc.transport,
        url: doc.transport === "stdio" ? null : safeMcpUrl(doc.url),
        comando: doc.transport === "stdio" ? doc.command : null,
        argumentos: doc.args?.length ?? 0,
        headers: (doc.headers ?? []).map((entry) => entry.key),
        variaveis: (doc.env ?? []).map((entry) => entry.key),
        confirmacoes: doc.confirmations ?? {},
    }
}

async function afterChange(id: string): Promise<void> {
    await publishAppEvent(OPEX_MCP_EVENT, { id })
}

async function assertSlugFree(slug: string, exceptId?: string): Promise<void> {
    const taken = await OpexMcpServer.findOne({ slug, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select({ _id: 1 }).lean()
    if (taken) throw new DomainError(409, `Já existe um MCP com o identificador "${slug}".`, "OPEX_MCP_SLUG_TAKEN")
}

/** Argumentos sem as linhas vazias do formulário (um por linha). */
const cleanArgs = (args: readonly string[]) => args.filter((arg) => arg.trim() !== "")

function fieldsOf(input: OpexMcpServerInput, existing: Pick<IOpexMcpServer, "headers" | "env"> | null) {
    const stdio = input.transport === "stdio"
    return {
        name: input.name,
        slug: input.slug,
        description: input.description,
        enabled: input.enabled,
        transport: input.transport,
        url: stdio ? "" : input.url,
        command: stdio ? input.command : "",
        args: stdio ? cleanArgs(input.args) : [],
        headers: stdio ? [] : mergeMcpSecrets(input.headers, existing?.headers ?? [], "o header"),
        env: stdio ? mergeMcpSecrets(input.env, existing?.env ?? [], "a variável") : [],
        confirmations: input.confirmations,
    }
}

export async function createMcpServer(input: OpexMcpServerInput, actorId: string): Promise<OpexMcpServerDto> {
    await dbConnect()
    await assertSlugFree(input.slug)
    const fields = fieldsOf(input, null)
    const doc = await OpexMcpServer.create({ ...fields, tools: input.tools ?? [], toolsSyncedAt: input.tools ? new Date() : null })
    const id = String(doc._id)
    await recordAudit({ userId: actorId, entidade: OPEX_MCP_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.CRIAR, depois: auditSnapshot(fields) })
    await afterChange(id)
    return getMcpServer(id)
}

export async function updateMcpServer(id: string, input: OpexMcpServerInput, actorId: string): Promise<OpexMcpServerDto> {
    const before = await loadDoc(id)
    await assertSlugFree(input.slug, id)
    const fields = fieldsOf(input, before)
    const connectionChanged = before.transport !== fields.transport || before.url !== fields.url || before.command !== fields.command
    await OpexMcpServer.updateOne(
        { _id: before._id },
        {
            $set: {
                ...fields,
                ...(input.tools ? { tools: input.tools, toolsSyncedAt: new Date() } : {}),
                // Endereço ou comando novo: o erro antigo deixa de valer até a próxima conexão.
                ...(connectionChanged ? { lastError: null, lastCheckedAt: null } : {}),
            },
        },
    )
    await recordAudit({ userId: actorId, entidade: OPEX_MCP_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: auditSnapshot(before), depois: auditSnapshot(fields) })
    await afterChange(id)
    return getMcpServer(id)
}

export async function setMcpServerEnabled(id: string, enabled: boolean, actorId: string): Promise<OpexMcpServerDto> {
    const before = await loadDoc(id)
    if (before.enabled !== enabled) {
        await OpexMcpServer.updateOne({ _id: before._id }, { $set: { enabled } })
        await recordAudit({ userId: actorId, entidade: OPEX_MCP_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: { habilitado: before.enabled }, depois: { habilitado: enabled } })
        await afterChange(id)
    }
    return getMcpServer(id)
}

/** "Pede confirmação" de uma ferramenta; `null` volta ao padrão pela anotação. */
export async function setMcpToolConfirmation(id: string, toolName: string, confirms: boolean | null, actorId: string): Promise<OpexMcpServerDto> {
    const before = await loadDoc(id)
    const tool: Pick<OpexMcpToolInfo, "name" | "annotations"> = (before.tools ?? []).find((item) => item.name === toolName) ?? { name: toolName, annotations: {} }
    const current = { ...(before.confirmations ?? {}) }
    delete current[toolName]
    const confirmations = confirms === null ? current : nextMcpConfirmations(before.confirmations ?? {}, tool, confirms)
    await OpexMcpServer.updateOne({ _id: before._id }, { $set: { confirmations } })
    await recordAudit({ userId: actorId, entidade: OPEX_MCP_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: { confirmacoes: before.confirmations ?? {} }, depois: { confirmacoes: confirmations } })
    await afterChange(id)
    return getMcpServer(id)
}

/** Exclui o MCP e o retira dos clientes que o tinham liberado. */
export async function deleteMcpServer(id: string, actorId: string): Promise<{ deleted: true }> {
    const before = await loadDoc(id)
    await OpexMcpServer.deleteOne({ _id: before._id })
    await OrcamentoClient.updateMany({ "opexAgent.enabledMcpServers": id }, { $pull: { "opexAgent.enabledMcpServers": id } })
    await recordAudit({ userId: actorId, entidade: OPEX_MCP_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: auditSnapshot(before) })
    await afterChange(id)
    return { deleted: true }
}

/**
 * Situação da última conexão (turno do agente ou teste). Só grava e avisa a tela quando algo mudou,
 * para não gerar um evento a cada turno.
 */
export async function recordMcpStatus(id: string, status: { error: string | null; tools?: OpexMcpToolInfo[] }): Promise<void> {
    try {
        await dbConnect()
        const before = await OpexMcpServer.findById(id).select({ lastError: 1, tools: 1 }).lean<Pick<ServerDoc, "lastError" | "tools">>()
        if (!before) return
        const toolsChanged = status.tools !== undefined && JSON.stringify(status.tools) !== JSON.stringify(before.tools ?? [])
        const changed = (before.lastError ?? null) !== status.error || toolsChanged
        await OpexMcpServer.updateOne(
            { _id: id },
            { $set: { lastError: status.error, lastCheckedAt: new Date(), ...(status.tools !== undefined ? { tools: status.tools, toolsSyncedAt: new Date() } : {}) } },
            { timestamps: false },
        )
        if (changed) await afterChange(id)
    } catch (error) {
        log.warn({ err: error, mcpId: id }, "[opex-mcp] falha ao gravar a situação do MCP")
    }
}

async function probe(connection: McpConnection): Promise<OpexMcpTestResultDto> {
    const startedAt = Date.now()
    const client = await connectMcp(connection).catch((error: unknown) => error as Error)
    if (client instanceof Error) return { ok: false, tools: [], error: describeMcpError(client), durationMs: Date.now() - startedAt, serverInfo: null }
    try {
        const tools = toolInfosOf(await listMcpTools(client))
        const info = client.serverInfo
        return { ok: true, tools, error: null, durationMs: Date.now() - startedAt, serverInfo: info?.name ? `${info.name}${info.version ? ` ${info.version}` : ""}` : null }
    } catch (error) {
        return { ok: false, tools: [], error: describeMcpError(error), durationMs: Date.now() - startedAt, serverInfo: null }
    } finally {
        await closeMcp(client)
    }
}

/** "Testar conexão" de um rascunho (não grava nada). Com `id`, os segredos vazios usam os salvos. */
export async function testMcpConnection(input: OpexMcpTestInput): Promise<OpexMcpTestResultDto> {
    const existing = input.id ? await loadDoc(input.id) : null
    const stdio = input.transport === "stdio"
    const connection = mcpConnectionOf({
        transport: input.transport,
        url: stdio ? "" : input.url,
        command: stdio ? input.command : "",
        args: stdio ? cleanArgs(input.args) : [],
        headers: stdio ? [] : mergeMcpSecrets(input.headers, existing?.headers ?? [], "o header"),
        env: stdio ? mergeMcpSecrets(input.env, existing?.env ?? [], "a variável") : [],
    })
    const result = await probe(connection)
    log.info({ mcp: existing?.slug ?? null, transport: input.transport, ok: result.ok, tools: result.tools.length, durationMs: result.durationMs, err: result.error }, "[opex-mcp] teste de conexão")
    return result
}

/** Conecta a um MCP salvo, atualiza o retrato das ferramentas e a situação (ferramenta do agente). */
export async function refreshMcpServer(id: string): Promise<OpexMcpTestResultDto> {
    const doc = await loadDoc(id)
    const result = await probe(mcpConnectionOf(doc))
    await recordMcpStatus(id, result.ok ? { error: null, tools: result.tools } : { error: result.error })
    log.info({ mcp: doc.slug, ok: result.ok, tools: result.tools.length, durationMs: result.durationMs, err: result.error }, "[opex-mcp] conexão conferida")
    return result
}
