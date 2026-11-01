import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { OrcamentoClient, OrcamentoDraft, type IOrcamentoClient } from "@/lib/db/models/Orcamento"
import { Project } from "@/lib/db/models/Project"
import { publishAppEvent } from "@/lib/pusher/channels"
import type { ProjectRef } from "@/features/tasks/types"
import { CLIENTE_AUDIT_ENTITY, ORCAMENTOS_UPDATED_EVENT, clienteLoginPath } from "../constants"
import type { ClienteOrcamentoInput } from "../schemas"
import type { ClienteOrcamentoDto, CreatedClienteOrcamentoDto } from "../types"
import { newClientTokenValue, type ClienteOrcamentoDoc } from "./token"
import { ensureDefaultUser, removeClientUsers } from "./users"

/**
 * Clientes do portal de Orçamentos (SOMENTE servidor): CRUD com auditoria e evento em `private-app`.
 * O token (valor em claro) só é devolvido na criação e na regeneração.
 */

type ClientDoc = IOrcamentoClient & { _id: unknown }

const OBJECT_ID = /^[a-f0-9]{24}$/i

async function projectRefs(projectIds: string[]): Promise<Map<string, ProjectRef>> {
    if (projectIds.length === 0) return new Map()
    const docs = await Project.find({ _id: { $in: projectIds } }).lean()
    return new Map(docs.map((project) => [String(project._id), { id: String(project._id), name: project.name, repo: project.repo, sigla: project.sigla }]))
}

function toDto(doc: ClientDoc, projects: Map<string, ProjectRef>): ClienteOrcamentoDto {
    return {
        id: String(doc._id),
        name: doc.name,
        tokenPrefix: doc.tokenPrefix,
        portalPath: clienteLoginPath(doc.token ?? ""),
        projectIds: doc.projectIds ?? [],
        projects: (doc.projectIds ?? []).map((id) => projects.get(id)).filter((item): item is ProjectRef => Boolean(item)),
        hourlyRate: doc.hourlyRate ?? 0,
        profitFactor: doc.profitFactor ?? 1,
        active: doc.active !== false,
        createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
        updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    }
}

async function listDto(): Promise<ClienteOrcamentoDto[]> {
    const docs = (await OrcamentoClient.find().sort({ name: 1 }).lean()) as ClientDoc[]
    const ids = [...new Set(docs.flatMap((doc) => doc.projectIds ?? []))]
    const projects = await projectRefs(ids)
    return docs.map((doc) => toDto(doc, projects))
}

export async function listClients(): Promise<ClienteOrcamentoDto[]> {
    await dbConnect()
    return listDto()
}

async function assertProjects(projectIds: string[]): Promise<void> {
    const valid = projectIds.every((id) => OBJECT_ID.test(id))
    if (!valid) throw new DomainError(400, "Repositório inválido", "PROJECT_NOT_FOUND")
    const count = await Project.countDocuments({ _id: { $in: projectIds } })
    if (count !== new Set(projectIds).size) throw new DomainError(400, "Um dos repositórios escolhidos não existe", "PROJECT_NOT_FOUND")
}

const auditView = (input: ClienteOrcamentoInput) => ({
    nome: input.name,
    repositorios: input.projectIds.length,
    custoHora: input.hourlyRate,
    fatorLucro: input.profitFactor,
    ativo: input.active,
})

export async function createClient(input: ClienteOrcamentoInput, actorId: string): Promise<CreatedClienteOrcamentoDto> {
    await dbConnect()
    await assertProjects(input.projectIds)
    const { token, prefix, hash } = newClientTokenValue()
    const doc = (await OrcamentoClient.create({
        name: input.name,
        token,
        tokenHash: hash,
        tokenPrefix: prefix,
        projectIds: [...new Set(input.projectIds)],
        hourlyRate: input.hourlyRate,
        profitFactor: input.profitFactor,
        active: input.active,
    })) as unknown as ClientDoc
    await recordAudit({ userId: actorId, entidade: CLIENTE_AUDIT_ENTITY, entidadeId: String(doc._id), acao: AcaoAuditoria.CRIAR, depois: auditView(input) })
    // Todo cliente nasce com o **usuário padrão** (username do nome, admin, sem email/senha, token = do cliente).
    await ensureDefaultUser(doc)
    await publishAppEvent(ORCAMENTOS_UPDATED_EVENT, { scope: "clients" })
    const projects = await projectRefs(doc.projectIds)
    return { token, item: toDto(doc, projects) }
}

export async function updateClient(id: string, input: ClienteOrcamentoInput, actorId: string): Promise<ClienteOrcamentoDto> {
    await dbConnect()
    const before = (await OrcamentoClient.findById(id).lean()) as ClientDoc | null
    if (!before) throw new DomainError(404, "Cliente não encontrado", "CLIENT_NOT_FOUND")
    await assertProjects(input.projectIds)
    await OrcamentoClient.updateOne(
        { _id: id },
        { $set: { name: input.name, projectIds: [...new Set(input.projectIds)], hourlyRate: input.hourlyRate, profitFactor: input.profitFactor, active: input.active } },
    )
    await recordAudit({
        userId: actorId,
        entidade: CLIENTE_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { nome: before.name, custoHora: before.hourlyRate, fatorLucro: before.profitFactor, ativo: before.active !== false },
        depois: auditView(input),
    })
    await publishAppEvent(ORCAMENTOS_UPDATED_EVENT, { scope: "clients" })
    const updated = (await OrcamentoClient.findById(id).lean()) as ClientDoc
    const projects = await projectRefs(updated.projectIds ?? [])
    return toDto(updated, projects)
}

async function getClientDoc(id: string): Promise<ClientDoc> {
    const doc = (await OrcamentoClient.findById(id).lean()) as ClientDoc | null
    if (!doc) throw new DomainError(404, "Cliente não encontrado", "CLIENT_NOT_FOUND")
    return doc
}

/** Regenera o token: o valor antigo deixa de funcionar imediatamente. */
export async function regenerateClientToken(id: string, actorId: string): Promise<CreatedClienteOrcamentoDto> {
    await dbConnect()
    const before = await getClientDoc(id)
    const { token, prefix, hash } = newClientTokenValue()
    await OrcamentoClient.updateOne({ _id: id }, { $set: { token, tokenHash: hash, tokenPrefix: prefix } })
    await recordAudit({ userId: actorId, entidade: CLIENTE_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: { token: before.tokenPrefix }, depois: { token: prefix } })
    await publishAppEvent(ORCAMENTOS_UPDATED_EVENT, { scope: "clients" })
    const projects = await projectRefs(before.projectIds ?? [])
    return { token, item: toDto({ ...before, token, tokenPrefix: prefix }, projects) }
}

export async function deleteClient(id: string, actorId: string): Promise<void> {
    await dbConnect()
    const before = await getClientDoc(id)
    const { deleteClientOpexData } = await import("@/features/opex-agent/server/sessions")
    await Promise.all([OrcamentoClient.deleteOne({ _id: id }), OrcamentoDraft.deleteMany({ clientId: id }), deleteClientOpexData(id)])
    // Memórias do cliente nos agentes (Engramind): os canais são arquivados (recuperáveis); nunca lança.
    await (await import("@/features/ai/server/agent-memory-service")).archiveClientMemories(id)
    // Remove os vínculos dos usuários com este cliente (o **padrão** incluído); órfãos são excluídos.
    await removeClientUsers(id)
    await recordAudit({ userId: actorId, entidade: CLIENTE_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { nome: before.name } })
    await publishAppEvent(ORCAMENTOS_UPDATED_EVENT, { scope: "clients" })
}

/** Doc do cliente por id (para a página de configuração). */
export async function getClient(id: string): Promise<ClienteOrcamentoDoc> {
    await dbConnect()
    return getClientDoc(id)
}

/** DTO de um cliente (página de configuração). */
export async function getClientDto(id: string): Promise<ClienteOrcamentoDto> {
    const doc = await getClient(id)
    const projects = await projectRefs(doc.projectIds ?? [])
    return toDto(doc, projects)
}

/** Nomes dos projetos do cliente (para a tela do portal). Exportado para reúso no portal. */
export async function clientProjects(client: ClientDoc): Promise<ProjectRef[]> {
    const projects = await projectRefs(client.projectIds ?? [])
    return (client.projectIds ?? []).map((id) => projects.get(id)).filter((item): item is ProjectRef => Boolean(item))
}
