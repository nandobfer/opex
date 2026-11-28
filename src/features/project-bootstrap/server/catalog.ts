import { isValidObjectId } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { AiFeatureSetting } from "@/lib/db/models/Ai"
import { publishAppEvent } from "@/lib/pusher/channels"
import { PROJECT_BOOTSTRAP_CATALOG_UPDATED_EVENT, PROJECT_BOOTSTRAP_TECH_AUDIT_ENTITY, PROJECT_BOOTSTRAP_TECH_GROUP_AUDIT_ENTITY } from "../constants"
import type { TechGroupInput, TechnologyInput } from "../schemas"
import { SEED_TECH_GROUPS } from "../seed/technologies"
import type { TechCatalogDto, TechGroupDto, TechnologyDto } from "../types"
import { ProjectBootstrapTechGroup, ProjectBootstrapTechnology } from "./models"

/**
 * Catálogo de tecnologias do Agente de Bootstrap (SOMENTE servidor): grupos com cor e tecnologias com
 * as variantes reconhecidas no contexto do projeto.
 */

/** Marca da carga inicial (gravada uma vez: o que o dono remover depois não volta). */
export const CATALOG_SEED_FEATURE = "project-bootstrap-catalog"

async function publishCatalog(kind: "group" | "technology" | "seed"): Promise<void> {
    await publishAppEvent(PROJECT_BOOTSTRAP_CATALOG_UPDATED_EVENT, { kind }).catch(() => undefined)
}

function assertId(id: string, what: "grupo" | "tecnologia"): void {
    if (!isValidObjectId(id)) throw new DomainError(404, what === "grupo" ? "Grupo não encontrado" : "Tecnologia não encontrada", what === "grupo" ? "TECH_GROUP_NOT_FOUND" : "TECHNOLOGY_NOT_FOUND")
}

const duplicate = (error: unknown) => (error as { code?: number }).code === 11000

export async function getTechCatalog(): Promise<TechCatalogDto> {
    await dbConnect()
    const [groups, technologies] = await Promise.all([ProjectBootstrapTechGroup.find().sort({ order: 1, name: 1 }).lean(), ProjectBootstrapTechnology.find().sort({ name: 1 }).lean()])
    const counts = new Map<string, number>()
    for (const tech of technologies) counts.set(tech.groupId, (counts.get(tech.groupId) ?? 0) + 1)
    return {
        groups: groups.map((group): TechGroupDto => ({ id: String(group._id), name: group.name, color: group.color, order: group.order, count: counts.get(String(group._id)) ?? 0 })),
        technologies: technologies.map((tech): TechnologyDto => ({ id: String(tech._id), name: tech.name, aliases: tech.aliases ?? [], groupId: tech.groupId })),
    }
}

export async function createTechGroup(input: TechGroupInput, actorId: string): Promise<TechGroupDto> {
    await dbConnect()
    const last = await ProjectBootstrapTechGroup.findOne().sort({ order: -1 }).select({ order: 1 }).lean()
    let doc
    try {
        doc = await ProjectBootstrapTechGroup.create({ name: input.name, color: input.color, order: (last?.order ?? -1) + 1 })
    } catch (error) {
        if (duplicate(error)) throw new DomainError(409, `Já existe o grupo ${input.name}`, "TECH_GROUP_EXISTS")
        throw error
    }
    await recordAudit({ userId: actorId, entidade: PROJECT_BOOTSTRAP_TECH_GROUP_AUDIT_ENTITY, entidadeId: String(doc._id), acao: AcaoAuditoria.CRIAR, depois: { nome: input.name, cor: input.color } })
    await publishCatalog("group")
    return { id: String(doc._id), name: doc.name, color: doc.color, order: doc.order, count: 0 }
}

export async function updateTechGroup(id: string, input: TechGroupInput, actorId: string): Promise<TechGroupDto> {
    assertId(id, "grupo")
    await dbConnect()
    const before = await ProjectBootstrapTechGroup.findById(id).lean()
    if (!before) throw new DomainError(404, "Grupo não encontrado", "TECH_GROUP_NOT_FOUND")
    try {
        await ProjectBootstrapTechGroup.updateOne({ _id: id }, { $set: { name: input.name, color: input.color } })
    } catch (error) {
        if (duplicate(error)) throw new DomainError(409, `Já existe o grupo ${input.name}`, "TECH_GROUP_EXISTS")
        throw error
    }
    await recordAudit({ userId: actorId, entidade: PROJECT_BOOTSTRAP_TECH_GROUP_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: { nome: before.name, cor: before.color }, depois: { nome: input.name, cor: input.color } })
    await publishCatalog("group")
    const count = await ProjectBootstrapTechnology.countDocuments({ groupId: id })
    return { id, name: input.name, color: input.color, order: before.order, count }
}

/** Um grupo que ainda tem tecnologias não pode ser removido. */
export async function deleteTechGroup(id: string, actorId: string): Promise<void> {
    assertId(id, "grupo")
    await dbConnect()
    const before = await ProjectBootstrapTechGroup.findById(id).lean()
    if (!before) throw new DomainError(404, "Grupo não encontrado", "TECH_GROUP_NOT_FOUND")
    const count = await ProjectBootstrapTechnology.countDocuments({ groupId: id })
    if (count > 0) throw new DomainError(409, `O grupo ${before.name} ainda tem ${count} tecnologia(s): mova-as ou remova-as antes`, "TECH_GROUP_IN_USE")
    await ProjectBootstrapTechGroup.deleteOne({ _id: id })
    await recordAudit({ userId: actorId, entidade: PROJECT_BOOTSTRAP_TECH_GROUP_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { nome: before.name, cor: before.color } })
    await publishCatalog("group")
}

async function assertGroup(groupId: string): Promise<void> {
    if (!isValidObjectId(groupId) || !(await ProjectBootstrapTechGroup.exists({ _id: groupId }))) throw new DomainError(400, "O grupo escolhido não existe", "TECH_GROUP_NOT_FOUND")
}

const cleanAliases = (input: TechnologyInput) => [...new Map(input.aliases.map((alias) => [alias.toLowerCase(), alias.trim()])).values()].filter((alias) => alias.toLowerCase() !== input.name.toLowerCase())

export async function createTechnology(input: TechnologyInput, actorId: string): Promise<TechnologyDto> {
    await dbConnect()
    await assertGroup(input.groupId)
    const aliases = cleanAliases(input)
    let doc
    try {
        doc = await ProjectBootstrapTechnology.create({ name: input.name, aliases, groupId: input.groupId })
    } catch (error) {
        if (duplicate(error)) throw new DomainError(409, `Já existe a tecnologia ${input.name}`, "TECHNOLOGY_EXISTS")
        throw error
    }
    await recordAudit({ userId: actorId, entidade: PROJECT_BOOTSTRAP_TECH_AUDIT_ENTITY, entidadeId: String(doc._id), acao: AcaoAuditoria.CRIAR, depois: { nome: input.name, variantes: aliases, grupo: input.groupId } })
    await publishCatalog("technology")
    return { id: String(doc._id), name: doc.name, aliases, groupId: doc.groupId }
}

export async function updateTechnology(id: string, input: TechnologyInput, actorId: string): Promise<TechnologyDto> {
    assertId(id, "tecnologia")
    await dbConnect()
    const before = await ProjectBootstrapTechnology.findById(id).lean()
    if (!before) throw new DomainError(404, "Tecnologia não encontrada", "TECHNOLOGY_NOT_FOUND")
    await assertGroup(input.groupId)
    const aliases = cleanAliases(input)
    try {
        await ProjectBootstrapTechnology.updateOne({ _id: id }, { $set: { name: input.name, aliases, groupId: input.groupId } })
    } catch (error) {
        if (duplicate(error)) throw new DomainError(409, `Já existe a tecnologia ${input.name}`, "TECHNOLOGY_EXISTS")
        throw error
    }
    await recordAudit({ userId: actorId, entidade: PROJECT_BOOTSTRAP_TECH_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: { nome: before.name, variantes: before.aliases, grupo: before.groupId }, depois: { nome: input.name, variantes: aliases, grupo: input.groupId } })
    await publishCatalog("technology")
    return { id, name: input.name, aliases, groupId: input.groupId }
}

export async function deleteTechnology(id: string, actorId: string): Promise<void> {
    assertId(id, "tecnologia")
    await dbConnect()
    const before = await ProjectBootstrapTechnology.findById(id).lean()
    if (!before) throw new DomainError(404, "Tecnologia não encontrada", "TECHNOLOGY_NOT_FOUND")
    await ProjectBootstrapTechnology.deleteOne({ _id: id })
    await recordAudit({ userId: actorId, entidade: PROJECT_BOOTSTRAP_TECH_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { nome: before.name, variantes: before.aliases, grupo: before.groupId } })
    await publishCatalog("technology")
}

/**
 * Carga inicial (migração idempotente): grava os grupos e as tecnologias uma única vez, marcando a
 * carga. Com a marca, não faz nada (o que o dono remover não volta).
 *
 * Roda como migração no `dbConnect()`, com a conexão já aberta: não chama `dbConnect` de novo (nem nada
 * que o chame), para não travar o registro — ele esperaria a própria migração terminar.
 */
export async function seedTechCatalog(): Promise<{ seeded: boolean }> {
    if (await AiFeatureSetting.exists({ feature: CATALOG_SEED_FEATURE })) return { seeded: false }
    for (const [order, group] of SEED_TECH_GROUPS.entries()) {
        const saved = await ProjectBootstrapTechGroup.findOneAndUpdate({ name: group.name }, { $setOnInsert: { name: group.name, color: group.color, order } }, { upsert: true, new: true }).lean()
        if (!saved) continue
        for (const tech of group.technologies) {
            await ProjectBootstrapTechnology.updateOne({ name: tech.name }, { $setOnInsert: { name: tech.name, aliases: [...tech.aliases], groupId: String(saved._id) } }, { upsert: true })
        }
    }
    await AiFeatureSetting.updateOne({ feature: CATALOG_SEED_FEATURE }, { $setOnInsert: { feature: CATALOG_SEED_FEATURE, settings: { seededAt: new Date().toISOString() }, updatedAt: new Date(), updatedBy: "migration" } }, { upsert: true })
    return { seeded: true }
}
