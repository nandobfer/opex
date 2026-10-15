import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { Counter } from "@/lib/db/models/Counter"
import { FinanceService } from "@/lib/db/models/FinanceService"
import { OrcamentoClient } from "@/lib/db/models/Orcamento"
import { Project } from "@/lib/db/models/Project"
import { DevTask } from "@/lib/db/models/DevTask"
import { runAfterResponse } from "@/lib/after-response"
import { loggerFor } from "@/lib/logger"
import { appChannel, clientChannel, publishToChannels } from "@/lib/pusher/channels"
import { resolveTagViews } from "@/features/orcamentos/server/tag-views"
import { countServiceAttachments, linkAttachmentsToService, syncServiceAttachmentsClient } from "@/features/tasks/attachments/server/service"
import { ownerAttachmentActor } from "@/features/tasks/attachments/server/actor"
import { nextProjectCode } from "@/features/tasks/server/service"
import type { ProjectRef } from "@/features/tasks/types"
import { SERVICE_AUDIT_ENTITY, SERVICE_CODE_COUNTER, SERVICE_CODE_PREFIX, SERVICES_UPDATED_EVENT } from "../constants"
import { computeServiceAmounts } from "../logic"
import type { ServiceWriteInput } from "../schemas"
import type { ServiceDto, ServiceTaskRef } from "../types"

/**
 * Serviços (SOMENTE servidor): CRUD do lançamento manual de faturamento e as consultas que o
 * Financeiro, o dashboard do dono e o portal do cliente usam. Os três valores reativos são sempre
 * recalculados aqui a partir do fator e do custo/hora **atuais** do cliente (snapshot gravado).
 */

const log = loggerFor({ module: "services" })
const OBJECT_ID = /^[a-f0-9]{24}$/i

/** Documento de serviço como o `.lean()` devolve (só os campos usados aqui). */
export interface ServiceRow {
    _id: unknown
    code: string
    clientId: string
    projectId: string | null
    taskId: string | null
    description: string
    title: string | null
    summary: string | null
    tags: string[]
    serviceDate: Date
    hours: number
    clientHours: number
    billingBrl: number
    factor: number
    hourlyRate: number
    aiStatus: "pending" | "done" | "error"
    aiError: string | null
    archived: boolean
    createdAt: Date
    updatedAt: Date
}

/** Serviço normalizado para as agregações do Financeiro (dono e portal). */
export interface ServiceAggregateRow {
    id: string
    code: string
    title: string
    summary: string | null
    clientId: string
    projectId: string | null
    project: ProjectRef | null
    taskId: string | null
    serviceDate: number
    hours: number
    clientHours: number
    billingBrl: number
    /** Arquivado (aparece só com o filtro "Mostrar arquivados"). */
    archived: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

function projectRef(project: { _id: unknown; name: string; repo: string; sigla: string } | null): ProjectRef | null {
    if (!project) return null
    return { id: String(project._id), name: project.name, repo: project.repo, sigla: project.sigla }
}

/** Converte a data do formulário (`yyyy-MM-dd`) no instante do dia (meia-noite UTC). */
function dateFromInput(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`)
    if (Number.isNaN(date.getTime())) throw new DomainError(400, "Data inválida", "INVALID_DATE")
    return date
}

interface ResolvedClient {
    id: string
    name: string
    profitFactor: number
    hourlyRate: number
}

async function resolveClient(clientId: string): Promise<ResolvedClient> {
    if (!OBJECT_ID.test(clientId)) throw new DomainError(400, "Cliente inválido", "CLIENT_NOT_FOUND")
    const client = await OrcamentoClient.findById(clientId).select({ name: 1, profitFactor: 1, hourlyRate: 1 }).lean()
    if (!client) throw new DomainError(400, "Cliente não encontrado", "CLIENT_NOT_FOUND")
    return { id: String(client._id), name: client.name, profitFactor: client.profitFactor ?? 1, hourlyRate: client.hourlyRate ?? 0 }
}

/** Código do serviço: com repositório e sigla, segue a **mesma sequência das tarefas**; senão `SRV-{n}`. */
async function allocateCode(projectId: string | null): Promise<string> {
    if (projectId && OBJECT_ID.test(projectId)) {
        const project = await Project.findById(projectId)
        if (project?.sigla) return nextProjectCode(project)
    }
    const counter = await Counter.findOneAndUpdate({ key: SERVICE_CODE_COUNTER }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" }).lean()
    return `${SERVICE_CODE_PREFIX}-${counter?.seq ?? 1}`
}

/** Primeira linha não vazia da descrição — rótulo de reserva quando a IA não gerou título. */
function firstLine(description: string): string {
    const line = description
        .split(/\r?\n/)
        .map((item) => item.replace(/^#+\s*/, "").trim())
        .find((item) => item.length > 0) ?? ""
    return line.slice(0, 120)
}

async function assertProject(projectId: string | null | undefined): Promise<void> {
    if (!projectId) return
    if (!OBJECT_ID.test(projectId)) throw new DomainError(400, "Repositório inválido", "PROJECT_NOT_FOUND")
    if (!(await Project.exists({ _id: projectId }))) throw new DomainError(400, "Repositório não encontrado", "PROJECT_NOT_FOUND")
}

async function assertTask(taskId: string | null | undefined): Promise<void> {
    if (!taskId) return
    if (!OBJECT_ID.test(taskId)) throw new DomainError(400, "Tarefa inválida", "TASK_NOT_FOUND")
    if (!(await DevTask.exists({ _id: taskId }))) throw new DomainError(400, "Tarefa não encontrada", "TASK_NOT_FOUND")
}

function toServiceDto(doc: ServiceRow, extra: { clientName: string | null; project: ProjectRef | null; task: ServiceTaskRef | null; tags: ServiceDto["tags"]; attachmentsCount: number }): ServiceDto {
    return {
        id: String(doc._id),
        code: doc.code,
        clientId: doc.clientId,
        clientName: extra.clientName,
        project: extra.project,
        task: extra.task,
        description: doc.description,
        title: doc.title ?? null,
        summary: doc.summary ?? null,
        tags: extra.tags,
        serviceDate: new Date(doc.serviceDate).toISOString(),
        hours: doc.hours ?? 0,
        clientHours: doc.clientHours ?? 0,
        billingBrl: doc.billingBrl ?? 0,
        factor: doc.factor ?? 1,
        hourlyRate: doc.hourlyRate ?? 0,
        aiStatus: doc.aiStatus ?? "pending",
        aiError: doc.aiError ?? null,
        archived: doc.archived === true,
        attachmentsCount: extra.attachmentsCount,
        createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
        updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    }
}

/** Monta o DTO resolvendo cliente, repositório, tarefa vinculada, tags e contagem de anexos. */
async function hydrate(doc: unknown): Promise<ServiceDto> {
    const service = doc as ServiceRow
    const [client, project, task, tags, attachmentsCount] = await Promise.all([
        OrcamentoClient.findById(service.clientId).select({ name: 1 }).lean(),
        service.projectId ? Project.findById(service.projectId).select({ name: 1, repo: 1, sigla: 1 }).lean() : Promise.resolve(null),
        service.taskId ? DevTask.findById(service.taskId).select({ code: 1, title: 1 }).lean() : Promise.resolve(null),
        resolveTagViews(service.tags ?? []),
        countServiceAttachments(String(service._id)),
    ])
    const taskRef: ServiceTaskRef | null = service.taskId
        ? task
            ? { id: String(task._id), code: task.code, title: task.title, exists: true }
            : { id: service.taskId, code: "—", title: "Tarefa removida", exists: false }
        : null
    return toServiceDto(service, { clientName: client?.name ?? null, project: projectRef(project ?? null), task: taskRef, tags, attachmentsCount })
}

// ── Leitura ────────────────────────────────────────────────────────────────

export async function getService(id: string): Promise<ServiceDto> {
    await dbConnect()
    if (!OBJECT_ID.test(id)) throw new DomainError(404, "Serviço não encontrado", "SERVICE_NOT_FOUND")
    const doc = await FinanceService.findById(id).lean()
    if (!doc) throw new DomainError(404, "Serviço não encontrado", "SERVICE_NOT_FOUND")
    return hydrate(doc)
}

/**
 * Serviços **ativos** (por padrão) no período, já normalizados para as agregações do Financeiro.
 * Serviço sem repositório é excluído quando há filtro de repositório (como as tarefas sem projeto).
 */
export async function listServiceAggregates(range: {
    from?: string | null
    to?: string | null
    clientIds?: readonly string[]
    projectIds?: readonly string[]
    includeArchived?: boolean
}): Promise<ServiceAggregateRow[]> {
    await dbConnect()
    const filter: Record<string, unknown> = {}
    if (!range.includeArchived) filter.archived = { $ne: true }
    if (range.from || range.to) {
        const window: Record<string, Date> = {}
        if (range.from) window.$gte = new Date(range.from)
        if (range.to) window.$lte = new Date(range.to)
        filter.serviceDate = window
    }
    if (range.clientIds && range.clientIds.length > 0) filter.clientId = { $in: [...range.clientIds] }
    if (range.projectIds && range.projectIds.length > 0) filter.projectId = { $in: [...range.projectIds] }

    const docs = (await FinanceService.find(filter).sort({ serviceDate: -1 }).lean()) as unknown as ServiceRow[]
    if (docs.length === 0) return []
    const projectIds = [...new Set(docs.map((doc) => doc.projectId).filter((id): id is string => Boolean(id)))]
    const projects = await Project.find({ _id: { $in: projectIds } })
        .select({ name: 1, repo: 1, sigla: 1 })
        .lean()
    const projectsById = new Map(projects.map((project) => [String(project._id), projectRef(project)!]))
    return docs.map((doc) => ({
        id: String(doc._id),
        code: doc.code,
        title: doc.title?.trim() || doc.summary?.trim() || firstLine(doc.description),
        summary: doc.summary ?? null,
        clientId: doc.clientId,
        projectId: doc.projectId,
        project: doc.projectId ? projectsById.get(doc.projectId) ?? null : null,
        taskId: doc.taskId,
        serviceDate: new Date(doc.serviceDate).getTime(),
        hours: doc.hours ?? 0,
        clientHours: doc.clientHours ?? 0,
        billingBrl: doc.billingBrl ?? 0,
        archived: doc.archived === true,
    }))
}

/** Serviço de um cliente (portal): só o registro do próprio cliente e não arquivado. */
export async function getClientServiceRow(clientId: string, id: string): Promise<ServiceRow | null> {
    await dbConnect()
    if (!OBJECT_ID.test(id)) return null
    const doc = await FinanceService.findOne({ _id: id, clientId, archived: { $ne: true } }).lean()
    return (doc as unknown as ServiceRow) ?? null
}

// ── Mutações ───────────────────────────────────────────────────────────────

export async function createService(input: ServiceWriteInput, actorId: string): Promise<ServiceDto> {
    await dbConnect()
    const client = await resolveClient(input.clientId)
    await Promise.all([assertProject(input.projectId), assertTask(input.taskId)])

    const projectId = input.projectId ?? null
    const amounts = computeServiceAmounts({
        origin: input.origin,
        hours: input.hours,
        clientHours: input.clientHours,
        billingBrl: input.billingBrl,
        factor: client.profitFactor,
        hourlyRate: client.hourlyRate,
    })
    const code = await allocateCode(projectId)

    const doc = await FinanceService.create({
        code,
        clientId: client.id,
        projectId,
        taskId: input.taskId ?? null,
        description: input.description,
        title: input.title?.trim() || null,
        summary: input.summary?.trim() || null,
        summarySourceHash: null,
        summaryUpdatedAt: null,
        tags: [],
        tagsSourceHash: null,
        tagsUpdatedAt: null,
        serviceDate: dateFromInput(input.serviceDate),
        hours: amounts.hours,
        clientHours: amounts.clientHours,
        billingBrl: amounts.billingBrl,
        factor: client.profitFactor,
        hourlyRate: client.hourlyRate,
        aiStatus: "pending",
        aiError: null,
        archived: false,
    })
    const id = String(doc._id)

    if (input.attachmentIds?.length) await linkAttachmentsToService(ownerAttachmentActor(), input.attachmentIds, id)

    await recordAudit({
        userId: actorId,
        entidade: SERVICE_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.CRIAR,
        depois: { codigo: code, cliente: client.name, data: input.serviceDate, horas: amounts.hours, inflada: amounts.clientHours, faturamento: amounts.billingBrl },
    })
    scheduleServiceAi(id)
    await publishServicesUpdated([id])
    return getService(id)
}

export async function updateService(id: string, input: ServiceWriteInput, actorId: string): Promise<ServiceDto> {
    await dbConnect()
    const current = (await FinanceService.findById(id).lean()) as unknown as ServiceRow | null
    if (!current) throw new DomainError(404, "Serviço não encontrado", "SERVICE_NOT_FOUND")
    const client = await resolveClient(input.clientId)
    await Promise.all([assertProject(input.projectId), assertTask(input.taskId)])

    const amounts = computeServiceAmounts({
        origin: input.origin,
        hours: input.hours,
        clientHours: input.clientHours,
        billingBrl: input.billingBrl,
        factor: client.profitFactor,
        hourlyRate: client.hourlyRate,
    })
    const descriptionChanged = (current.description ?? "") !== input.description
    const providedTitle = input.title?.trim() || null
    const providedSummary = input.summary?.trim() || null

    await FinanceService.updateOne(
        { _id: id },
        {
            $set: {
                clientId: client.id,
                projectId: input.projectId ?? null,
                taskId: input.taskId ?? null,
                description: input.description,
                ...(providedTitle !== null ? { title: providedTitle } : {}),
                ...(providedSummary !== null ? { summary: providedSummary } : {}),
                serviceDate: dateFromInput(input.serviceDate),
                hours: amounts.hours,
                clientHours: amounts.clientHours,
                billingBrl: amounts.billingBrl,
                factor: client.profitFactor,
                hourlyRate: client.hourlyRate,
                // Descrição mudou: título/resumo/tags ficam desatualizados e a IA roda de novo.
                ...(descriptionChanged ? { aiStatus: "pending", aiError: null } : providedTitle || providedSummary ? { aiStatus: "done", aiError: null } : {}),
            },
        },
    )

    if (input.attachmentIds?.length) await linkAttachmentsToService(ownerAttachmentActor(), input.attachmentIds, id)
    // O cliente pode ter mudado: realinha a visibilidade dos anexos do serviço.
    await syncServiceAttachmentsClient(id, client.id)

    await recordAudit({
        userId: actorId,
        entidade: SERVICE_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { cliente: current.clientId, horas: current.hours, inflada: current.clientHours, faturamento: current.billingBrl },
        depois: { cliente: client.name, horas: amounts.hours, inflada: amounts.clientHours, faturamento: amounts.billingBrl },
    })
    if (descriptionChanged) scheduleServiceAi(id)
    await publishServicesUpdated([id])
    return getService(id)
}

/** Soft delete / restauração. Arquivado some das somas/listas/dashboard/portal. */
export async function setServiceArchived(id: string, archived: boolean, actorId: string): Promise<ServiceDto> {
    await dbConnect()
    const current = await FinanceService.findById(id).select({ code: 1, archived: 1 }).lean()
    if (!current) throw new DomainError(404, "Serviço não encontrado", "SERVICE_NOT_FOUND")
    await FinanceService.updateOne({ _id: id }, { $set: { archived } })
    await recordAudit({
        userId: actorId,
        entidade: SERVICE_AUDIT_ENTITY,
        entidadeId: id,
        acao: archived ? AcaoAuditoria.EXCLUIR : AcaoAuditoria.ATUALIZAR,
        antes: { arquivado: current.archived === true },
        depois: { arquivado: archived, codigo: current.code },
    })
    await publishServicesUpdated([id])
    return getService(id)
}

/** Reinicia a geração de IA (título, resumo e tags) em segundo plano. */
export async function requestServiceAi(id: string): Promise<void> {
    await dbConnect()
    const exists = await FinanceService.exists({ _id: id })
    if (!exists) throw new DomainError(404, "Serviço não encontrado", "SERVICE_NOT_FOUND")
    await FinanceService.updateOne({ _id: id }, { $set: { aiStatus: "pending", aiError: null } })
    await publishServicesUpdated([id])
    scheduleServiceAi(id)
}

function scheduleServiceAi(id: string): void {
    runAfterResponse("service-ai", async () => {
        const { generateServiceAi } = await import("./ai")
        await generateServiceAi(id)
    })
}

// ── Tempo real ─────────────────────────────────────────────────────────────

/** Publica `services-updated` no app (dono) e nos canais dos clientes dos serviços afetados. */
export async function publishServicesUpdated(ids: string[]): Promise<void> {
    if (!ids.length) return
    await publishToChannels([appChannel()], SERVICES_UPDATED_EVENT, { ids })
    try {
        const docs = await FinanceService.find({ _id: { $in: ids } }).select({ clientId: 1 }).lean()
        const clientIds = [...new Set(docs.map((doc) => doc.clientId).filter((id): id is string => Boolean(id)))]
        if (clientIds.length) await publishToChannels(clientIds.map((clientId) => clientChannel(clientId)), SERVICES_UPDATED_EVENT, { ids })
    } catch (error) {
        log.warn({ err: error }, "[services] Falha ao publicar no canal do cliente")
    }
}

export { round2 }
