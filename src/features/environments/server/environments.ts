import { dbConnect } from "@/lib/db"
import { Environment, type IEnvironment } from "@/lib/db/models/Environment"
import { EnvironmentOperation } from "@/lib/db/models/EnvironmentOperation"
import { recordAudit, AcaoAuditoria } from "@/lib/audit/record"
import { DomainError } from "@/lib/api/route"
import type { IProject } from "@/lib/db/models/Project"
import { slugify } from "../logic"
import { ENVIRONMENT_AUDIT_ENTITY } from "../constants"
import type { EnvironmentActor } from "./actor"
import { assertCanAccessProject, assertCanManage } from "./actor"
import type { EnvironmentDto, EnvironmentInput } from "../types"
import type { WithId } from "./types"
import { toEnvironmentDto, toOperationDto } from "./dto"
import { stopEnvironmentLogCollector } from "./log-collector"

/**
 * CRUD dos ambientes de um repositório. O cliente só alcança ambientes de projetos vinculados; o
 * admin do cliente cria/edita (os segredos do host são exclusivos do dono). Toda mutação é auditada.
 */

function slugFor(input: EnvironmentInput): string {
    return slugify(input.slug?.trim() || input.name, "ambiente")
}

async function uniqueSlug(projectId: string, base: string, ignoreId?: string): Promise<string> {
    let candidate = base
    for (let i = 2; i < 100; i++) {
        const existing = await Environment.findOne({ projectId, slug: candidate, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) }).select({ _id: 1 }).lean()
        if (!existing) return candidate
        candidate = `${base}-${i}`
    }
    return `${base}-${Date.now()}`
}

export async function listEnvironments(projectId: string): Promise<WithId<IEnvironment>[]> {
    await dbConnect()
    return (await Environment.find({ projectId }).sort({ name: 1 }).lean()) as unknown as WithId<IEnvironment>[]
}

export async function getEnvironmentById(id: string): Promise<WithId<IEnvironment>> {
    await dbConnect()
    const env = (await Environment.findById(id).lean()) as unknown as WithId<IEnvironment> | null
    if (!env) throw new DomainError(404, "Ambiente não encontrado", "ENVIRONMENT_NOT_FOUND")
    return env
}

export function assertEnvironmentAccess(actor: EnvironmentActor, env: IEnvironment): void {
    assertCanAccessProject(actor, env.projectId)
}

/** DTOs da lista, já com a última operação de cada ambiente. */
export async function listEnvironmentDtos(projectId: string): Promise<EnvironmentDto[]> {
    const environments = await listEnvironments(projectId)
    if (environments.length === 0) return []
    const ids = environments.map((env) => String(env._id))
    const operations = await EnvironmentOperation.find({ environmentId: { $in: ids } }).sort({ createdAt: -1 }).lean()
    const latestByEnv = new Map<string, (typeof operations)[number]>()
    for (const operation of operations) if (!latestByEnv.has(operation.environmentId)) latestByEnv.set(operation.environmentId, operation)
    return environments.map((env) => {
        const dto = toEnvironmentDto(env)
        const operation = latestByEnv.get(String(env._id))
        dto.lastOperation = operation ? toOperationDto(operation) : null
        return dto
    })
}

export async function getEnvironmentDto(env: WithId<IEnvironment>): Promise<EnvironmentDto> {
    const dto = toEnvironmentDto(env)
    const operation = await EnvironmentOperation.findOne({ environmentId: String(env._id) }).sort({ createdAt: -1 }).lean()
    dto.lastOperation = operation ? toOperationDto(operation) : null
    return dto
}

export async function createEnvironment(actor: EnvironmentActor, project: WithId<IProject>, input: EnvironmentInput): Promise<WithId<IEnvironment>> {
    assertCanManage(actor)
    assertCanAccessProject(actor, String(project._id))
    await dbConnect()
    const projectId = String(project._id)
    const slug = await uniqueSlug(projectId, slugFor(input))
    const created = await Environment.create({
        projectId,
        name: input.name,
        slug,
        branch: input.branch,
        hostDirectory: input.hostDirectory,
        composeFile: input.composeFile,
        composeService: input.composeService,
        composeProject: input.composeProject,
        envFile: input.envFile,
        publishedPort: input.publishedPort,
        resources: input.resources,
        healthcheck: input.healthcheck,
        dbVersionSource: input.dbVersionSource,
        dbVersion: null,
        appliedDbVersion: null,
        appliedDbVersionAt: null,
        appliedDbVersionOperationId: null,
        status: { containers: [], running: false, partial: false, reachable: false, error: null, checkedAt: null },
        lastOperationId: null,
    })
    created.set("_auditContext", { userId: actor.userId })
    await created.save()
    await recordAudit({
        userId: actor.userId,
        entidade: ENVIRONMENT_AUDIT_ENTITY,
        entidadeId: String(created._id),
        acao: AcaoAuditoria.CRIAR,
        depois: { name: input.name, slug, branch: input.branch, projectId },
    })
    return created.toObject() as WithId<IEnvironment>
}

export async function updateEnvironment(actor: EnvironmentActor, env: WithId<IEnvironment>, input: EnvironmentInput): Promise<WithId<IEnvironment>> {
    assertCanManage(actor)
    assertEnvironmentAccess(actor, env)
    await dbConnect()
    const doc = await Environment.findById(env._id)
    if (!doc) throw new DomainError(404, "Ambiente não encontrado", "ENVIRONMENT_NOT_FOUND")
    const before = { name: doc.name, slug: doc.slug, branch: doc.branch, publishedPort: doc.publishedPort, composeProject: doc.composeProject }
    const desiredSlug = slugFor(input)
    if (desiredSlug !== doc.slug) doc.slug = await uniqueSlug(doc.projectId, desiredSlug, String(doc._id))
    doc.name = input.name
    doc.branch = input.branch
    doc.hostDirectory = input.hostDirectory
    doc.composeFile = input.composeFile
    doc.composeService = input.composeService
    doc.composeProject = input.composeProject
    doc.envFile = input.envFile
    doc.publishedPort = input.publishedPort
    doc.resources = input.resources
    doc.healthcheck = input.healthcheck
    doc.dbVersionSource = input.dbVersionSource
    doc.set("_auditContext", { userId: actor.userId })
    await doc.save()
    await recordAudit({
        userId: actor.userId,
        entidade: ENVIRONMENT_AUDIT_ENTITY,
        entidadeId: String(doc._id),
        acao: AcaoAuditoria.ATUALIZAR,
        antes: before,
        depois: { name: doc.name, slug: doc.slug, branch: doc.branch, publishedPort: doc.publishedPort, composeProject: doc.composeProject },
    })
    return doc.toObject() as WithId<IEnvironment>
}

/** Adota (ou troca) o projeto Compose existente no host — não reinicia nem recria containers. */
export async function adoptComposeProject(actor: EnvironmentActor, env: WithId<IEnvironment>, project: string): Promise<WithId<IEnvironment>> {
    assertCanManage(actor)
    assertEnvironmentAccess(actor, env)
    await dbConnect()
    const doc = await Environment.findById(env._id)
    if (!doc) throw new DomainError(404, "Ambiente não encontrado", "ENVIRONMENT_NOT_FOUND")
    const before = doc.composeProject
    doc.composeProject = project.trim()
    doc.set("_auditContext", { userId: actor.userId })
    await doc.save()
    await recordAudit({
        userId: actor.userId,
        entidade: ENVIRONMENT_AUDIT_ENTITY,
        entidadeId: String(doc._id),
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { composeProject: before },
        depois: { composeProject: doc.composeProject },
    })
    return doc.toObject() as WithId<IEnvironment>
}

export async function deleteEnvironment(actor: EnvironmentActor, env: WithId<IEnvironment>): Promise<void> {
    assertCanManage(actor)
    assertEnvironmentAccess(actor, env)
    await dbConnect()
    const active = await EnvironmentOperation.findOne({ environmentId: String(env._id), status: { $in: ["queued", "running"] } }).select({ _id: 1 }).lean()
    if (active) throw new DomainError(409, "Há uma operação em andamento neste ambiente.", "OPERATION_IN_PROGRESS")
    await Environment.deleteOne({ _id: env._id })
    stopEnvironmentLogCollector(String(env._id))
    await recordAudit({
        userId: actor.userId,
        entidade: ENVIRONMENT_AUDIT_ENTITY,
        entidadeId: String(env._id),
        acao: AcaoAuditoria.EXCLUIR,
        antes: { name: env.name, slug: env.slug, projectId: env.projectId },
    })
}
