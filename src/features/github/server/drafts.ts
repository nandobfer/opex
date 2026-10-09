import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { GithubIssueLink, GithubPerson, GithubRepoLink, TaskDraft, type IGithubRepoLink, type ITaskDraft, type TaskDraftState } from "@/lib/db/models/Github"
import { TaskBoardColumn, TaskLocalState } from "@/lib/db/models/TaskBoard"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { isCustomColumnKey } from "@/features/tasks/board"
import { goSipalTaskUrl, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, TASK_TYPE_LABELS, type TaskPriority, type TaskStatus, type TaskType } from "@/features/tasks/constants"
import { draftMongoId, draftTaskId, isDraftTaskId } from "@/features/tasks/drafts"
import type { TaskDto } from "@/features/tasks/types"
import { GoSipalError } from "@/features/go-sipal/client"
import { githubDownload, githubRequest } from "../client"
import { GITHUB_AUDIT } from "../constants"
import {
    buildTaskDescription,
    extractIssueImages,
    htmlImageSources,
    imageExtension,
    mapAssignee,
    mapPriority,
    mapTaskType,
    mapWorkPackage,
    mentionsIssue,
    previewBody,
    replaceImagesWithAttachments,
    type DeveloperRef,
    type GithubIssueLite,
} from "../logic"
import type { SendDraftInput, UpdateDraftInput } from "../schemas"
import type { DiscardedDraftDto, DraftCommentDto, GithubMappingDto, SendDraftResultDto, TaskDraftDetailDto } from "../types"
import { publishBoardUpdated, publishGithubUpdated } from "./events"
import { createGoTask, listGoProductTasks, listGoWorkPackages, updateGoTaskDescription, uploadGoAttachment } from "./go-sipal"
import { getMapping } from "./mappings"
import { peopleMap } from "./people"

/**
 * Rascunhos de tarefas criados a partir de issues do GitHub: aparecem no quadro (`draft-…`), são
 * editáveis e enviados ao Go! Sipal com confirmação. Somente servidor.
 */

type DraftDoc = ITaskDraft & { _id: unknown }

const PENDING_STATES: TaskDraftState[] = ["draft", "sending"]

export const draftCode = (repo: string, number: number) => `${repo.split("/")[1] ?? repo}#${number}`

async function loadDraft(taskId: string): Promise<DraftDoc> {
    if (!isDraftTaskId(taskId)) throw new DomainError(404, "Rascunho não encontrado", "DRAFT_NOT_FOUND")
    await dbConnect()
    const draft = await TaskDraft.findById(draftMongoId(taskId)).lean()
    if (!draft) throw new DomainError(404, "Rascunho não encontrado", "DRAFT_NOT_FOUND")
    return draft as DraftDoc
}

function assertPending(draft: DraftDoc): void {
    if (draft.state === "sent") throw new DomainError(409, `Este rascunho já foi enviado ao Go! Sipal${draft.goTaskCode ? ` (${draft.goTaskCode})` : ""}`, "DRAFT_SENT")
    if (draft.state === "discarded") throw new DomainError(409, "Este rascunho foi descartado: restaure-o antes", "DRAFT_DISCARDED")
}

export function draftToTask(draft: DraftDoc): TaskDto {
    const id = String(draft._id)
    const closed = draft.issueState === "closed"
    return {
        id: draftTaskId(id),
        code: draftCode(draft.repo, draft.number),
        title: draft.title,
        status: "backlog",
        order: 0,
        taskType: (draft.taskType as TaskType) ?? null,
        priority: draft.priority as TaskPriority,
        product: { id: draft.productId, name: draft.productName },
        workPackage: draft.workPackageId ? { id: draft.workPackageId, name: draft.workPackageName ?? "—", startDate: null, endDate: null } : null,
        assignee: draft.assigneeId ? { id: draft.assigneeId, name: draft.assigneeName ?? "—", email: draft.assigneeEmail ?? null } : null,
        commitUrl: null,
        pullRequestUrl: null,
        archived: false,
        createdAt: (draft.issueCreatedAt ?? draft.createdAt) ? new Date(draft.issueCreatedAt ?? draft.createdAt).toISOString() : null,
        updatedAt: draft.updatedAt ? new Date(draft.updatedAt).toISOString() : null,
        localColumn: draft.columnKey,
        localOrder: draft.order,
        draft: { id, repo: draft.repo, number: draft.number, issueClosed: closed },
        issue: { url: draft.issueUrl, repo: draft.repo, number: draft.number, state: closed ? "closed" : "open", notice: closed ? "Issue fechada antes do envio" : null },
    }
}

/** Rascunhos pendentes, como tarefas do quadro. */
export async function listBoardDrafts(): Promise<TaskDto[]> {
    await dbConnect()
    const drafts = await TaskDraft.find({ state: { $in: PENDING_STATES } }).lean()
    return drafts.map((draft) => draftToTask(draft as DraftDoc))
}

// ---------------------------------------------------------------------------
// Mapeamento issue → campos
// ---------------------------------------------------------------------------

export interface MappingContext {
    mapping: GithubMappingDto
    people: Map<string, DeveloperRef>
    links: Map<string, IGithubRepoLink>
    workPackages: (productId: string) => Promise<{ id: string; name: string }[]>
}

export async function buildMappingContext(): Promise<MappingContext> {
    await dbConnect()
    const [mapping, people, links] = await Promise.all([getMapping(), peopleMap(), GithubRepoLink.find().lean()])
    const cache = new Map<string, Promise<{ id: string; name: string }[]>>()
    return {
        mapping,
        people,
        links: new Map(links.map((link) => [link.repo, link])),
        workPackages: (productId) => {
            if (!cache.has(productId)) cache.set(productId, listGoWorkPackages(productId).catch(() => []))
            return cache.get(productId)!
        },
    }
}

type IssueFields = Pick<ITaskDraft, "repo" | "issueTitle" | "issueBody" | "labels" | "issueType" | "milestone" | "assignees" | "productId" | "taskType" | "priority">

/** Valores mapeados dos campos NÃO editados (+ a origem de todos os mapeados). */
export async function mappedValues(draft: IssueFields, edited: readonly string[], ctx: MappingContext): Promise<{ set: Partial<ITaskDraft>; origins: Record<string, string> }> {
    const link = ctx.links.get(draft.repo)
    const issue = { type: draft.issueType, labels: draft.labels, assignees: draft.assignees }
    const type = mapTaskType(issue, ctx.mapping.typeRules, ((link?.defaultType ?? draft.taskType) as TaskType) || "feature")
    const priority = mapPriority(issue, ctx.mapping.priorityRules, ((link?.defaultPriority ?? draft.priority) as TaskPriority) || "medium")
    const assignee = mapAssignee(issue, ctx.people)
    const workPackage = mapWorkPackage(draft.milestone, await ctx.workPackages(draft.productId))
    const set: Partial<ITaskDraft> = {}
    const isFree = (field: string) => !edited.includes(field)
    if (isFree("title")) set.title = draft.issueTitle
    if (isFree("body")) set.body = draft.issueBody
    if (isFree("taskType")) set.taskType = type.value
    if (isFree("priority")) set.priority = priority.value
    if (isFree("assignee")) Object.assign(set, { assigneeId: assignee.value?.id ?? null, assigneeName: assignee.value?.name ?? null, assigneeEmail: assignee.value?.email ?? null })
    if (isFree("workPackage")) Object.assign(set, { workPackageId: workPackage.value?.id ?? null, workPackageName: workPackage.value?.name ?? null })
    const origins: Record<string, string> = {
        taskType: isFree("taskType") ? type.origin : "editado",
        priority: isFree("priority") ? priority.origin : "editado",
        assignee: isFree("assignee") ? assignee.origin : "editado",
        workPackage: isFree("workPackage") ? workPackage.origin : "editado",
    }
    return { set, origins }
}

const issueFieldsOf = (issue: GithubIssueLite) => ({
    issueState: issue.state,
    issueStateReason: issue.stateReason,
    labels: issue.labels,
    issueType: issue.type,
    milestone: issue.milestone,
    assignees: issue.assignees,
    issueCreatedAt: issue.createdAt ? new Date(issue.createdAt) : null,
    issueUpdatedAt: issue.updatedAt ? new Date(issue.updatedAt) : null,
    issueTitle: issue.title,
    issueBody: issue.body,
})

async function nextOrder(columnKey: string): Promise<number> {
    const [state, draft] = await Promise.all([
        TaskLocalState.findOne({ columnKey }).sort({ order: -1 }).select({ order: 1 }).lean(),
        TaskDraft.findOne({ columnKey, state: { $in: PENDING_STATES } }).sort({ order: -1 }).lean(),
    ])
    return Math.max(state?.order ?? -1, draft?.order ?? -1) + 1
}

/** Cria o rascunho de uma issue nova na coluna de entrada do vínculo. */
export async function createDraftFromIssue(link: IGithubRepoLink, issue: GithubIssueLite, ctx: MappingContext): Promise<string> {
    const base = {
        repo: link.repo,
        number: issue.number,
        issueUrl: issue.htmlUrl,
        ...issueFieldsOf(issue),
        productId: link.productId,
        productName: link.productName,
        taskType: link.defaultType,
        priority: link.defaultPriority,
    }
    const { set, origins } = await mappedValues(base, [], ctx)
    const person = await GithubPerson.findOne({ login: issue.author.login }).select({ name: 1, developerName: 1 }).lean()
    const doc = await TaskDraft.create({
        ...base,
        ...set,
        title: set.title ?? issue.title,
        author: { login: issue.author.login, name: person?.developerName ?? person?.name ?? null, avatarUrl: issue.author.avatarUrl },
        origins,
        edited: [],
        columnKey: link.entryColumnKey,
        order: await nextOrder(link.entryColumnKey),
        state: "draft",
    })
    return String(doc._id)
}

/** Issue mudou (título, corpo, labels, estado…): atualiza o rascunho sem tocar no que foi editado. */
export async function refreshDraftFromIssue(draft: DraftDoc, issue: GithubIssueLite, ctx: MappingContext): Promise<boolean> {
    const fields = issueFieldsOf(issue)
    const changed = (Object.keys(fields) as (keyof typeof fields)[]).some((key) => JSON.stringify(fields[key] ?? null) !== JSON.stringify(draft[key] ?? null))
    if (!changed) return false
    if (draft.state !== "draft") {
        await TaskDraft.updateOne({ _id: draft._id }, { $set: { issueState: fields.issueState, issueStateReason: fields.issueStateReason } })
        return draft.issueState !== fields.issueState
    }
    const { set, origins } = await mappedValues({ ...draft, ...fields }, draft.edited ?? [], ctx)
    await TaskDraft.updateOne({ _id: draft._id }, { $set: { ...fields, ...set, origins } })
    return true
}

/** Mapeamento ou pessoas mudaram: reaplica nos rascunhos pendentes (campos não editados). */
export async function remapPendingDrafts(): Promise<number> {
    await dbConnect()
    const drafts = (await TaskDraft.find({ state: "draft" }).lean()) as DraftDoc[]
    if (drafts.length === 0) return 0
    const ctx = await buildMappingContext()
    const ids: string[] = []
    for (const draft of drafts) {
        const { set, origins } = await mappedValues(draft, draft.edited ?? [], ctx)
        const relevant = { ...set, origins }
        if ((Object.keys(relevant) as (keyof ITaskDraft)[]).some((key) => JSON.stringify(relevant[key] ?? null) !== JSON.stringify(draft[key] ?? null))) {
            await TaskDraft.updateOne({ _id: draft._id }, { $set: relevant })
            ids.push(draftTaskId(String(draft._id)))
        }
    }
    await publishBoardUpdated(ids)
    return ids.length
}

// ---------------------------------------------------------------------------
// Página do rascunho
// ---------------------------------------------------------------------------

interface RawIssueFull {
    body_html?: string | null
}

async function issueImageSources(draft: Pick<ITaskDraft, "repo" | "number">): Promise<string[]> {
    try {
        const issue = await githubRequest<RawIssueFull>(`/repos/${draft.repo}/issues/${draft.number}`, { accept: "application/vnd.github.full+json", label: "issue (imagens)" })
        return htmlImageSources(issue.body_html)
    } catch {
        return []
    }
}

async function issueComments(draft: Pick<ITaskDraft, "repo" | "number">): Promise<DraftCommentDto[]> {
    try {
        const comments = await githubRequest<{ id: number; body?: string; created_at?: string; user?: { login: string; avatar_url?: string } }[]>(
            `/repos/${draft.repo}/issues/${draft.number}/comments?per_page=50`,
            { label: "comentários da issue" },
        )
        return (comments ?? []).map((comment) => ({
            id: String(comment.id),
            author: comment.user ? { login: comment.user.login, name: null, avatarUrl: comment.user.avatar_url ?? null } : null,
            body: comment.body ?? "",
            createdAt: comment.created_at ?? null,
        }))
    } catch {
        return []
    }
}

export async function getDraftDetail(taskId: string): Promise<TaskDraftDetailDto> {
    const draft = await loadDraft(taskId)
    const [signed, comments, column, workPackages] = await Promise.all([
        issueImageSources(draft),
        issueComments(draft),
        isCustomColumnKey(draft.columnKey) ? TaskBoardColumn.findOne({ key: draft.columnKey }).select({ name: 1 }).lean() : null,
        listGoWorkPackages(draft.productId).catch(() => []),
    ])
    const task = draftToTask(draft)
    return {
        id: task.id,
        code: task.code,
        repo: draft.repo,
        number: draft.number,
        issueUrl: draft.issueUrl,
        author: { login: draft.author.login, name: draft.author.name ?? null, avatarUrl: draft.author.avatarUrl ?? null, developerName: draft.author.name ?? null },
        issueState: draft.issueState,
        issueStateReason: draft.issueStateReason ?? null,
        labels: draft.labels ?? [],
        issueType: draft.issueType ?? null,
        milestone: draft.milestone ?? null,
        assignees: draft.assignees ?? [],
        title: draft.title,
        body: draft.body ?? "",
        issueTitle: draft.issueTitle,
        issueBody: draft.issueBody ?? "",
        previewBody: previewBody(draft.body ?? "", signed),
        product: { id: draft.productId, name: draft.productName },
        taskType: draft.taskType as TaskType,
        priority: draft.priority as TaskPriority,
        assignee: task.assignee,
        workPackage: draft.workPackageId ? { id: draft.workPackageId, name: draft.workPackageName ?? "—" } : null,
        origins: draft.origins ?? {},
        edited: draft.edited ?? [],
        columnKey: draft.columnKey,
        columnName: column?.name ?? null,
        state: draft.state,
        goTaskId: draft.goTaskId ?? null,
        goTaskCode: draft.goTaskCode ?? null,
        images: draft.images ?? null,
        imageCount: extractIssueImages(draft.body ?? "").length,
        comments,
        workPackages,
        issueCreatedAt: draft.issueCreatedAt ? new Date(draft.issueCreatedAt).toISOString() : null,
        updatedAt: draft.updatedAt ? new Date(draft.updatedAt).toISOString() : null,
    }
}

function setFromInput(input: Omit<UpdateDraftInput, "restore">): { set: Partial<ITaskDraft>; fields: string[] } {
    const set: Partial<ITaskDraft> = {}
    const fields: string[] = []
    if (input.title !== undefined) {
        set.title = input.title.trim()
        fields.push("title")
    }
    if (input.body !== undefined) {
        set.body = input.body
        fields.push("body")
    }
    if (input.taskType !== undefined) {
        set.taskType = input.taskType
        fields.push("taskType")
    }
    if (input.priority !== undefined) {
        set.priority = input.priority
        fields.push("priority")
    }
    if (input.assignee !== undefined) {
        Object.assign(set, { assigneeId: input.assignee?.id ?? null, assigneeName: input.assignee?.name ?? null, assigneeEmail: input.assignee?.email ?? null })
        fields.push("assignee")
    }
    if (input.workPackage !== undefined) {
        Object.assign(set, { workPackageId: input.workPackage?.id ?? null, workPackageName: input.workPackage?.name ?? null })
        fields.push("workPackage")
    }
    return { set, fields }
}

const auditFields = (draft: Partial<ITaskDraft>) => ({
    ...(draft.title !== undefined ? { titulo: draft.title } : {}),
    ...(draft.taskType !== undefined ? { tipo: TASK_TYPE_LABELS[draft.taskType as TaskType] ?? draft.taskType } : {}),
    ...(draft.priority !== undefined ? { prioridade: TASK_PRIORITY_LABELS[draft.priority as TaskPriority] ?? draft.priority } : {}),
    ...(draft.assigneeId !== undefined ? { responsavel: draft.assigneeName ?? null } : {}),
    ...(draft.workPackageId !== undefined ? { pacote: draft.workPackageName ?? null } : {}),
    ...(draft.body !== undefined ? { descricao: "(alterada)" } : {}),
})

/** Edita campos (marcando-os como editados) e/ou restaura campos para o valor da issue. */
export async function updateDraft(taskId: string, input: UpdateDraftInput, actorId: string): Promise<TaskDto> {
    const draft = await loadDraft(taskId)
    assertPending(draft)
    const { restore = [], ...changes } = input
    const { set, fields } = setFromInput(changes)
    let edited = [...new Set([...(draft.edited ?? []).filter((field) => !restore.includes(field as never)), ...fields])]
    let origins = { ...(draft.origins ?? {}) }
    for (const field of fields) if (field in origins || ["taskType", "priority", "assignee", "workPackage"].includes(field)) origins[field] = "editado"
    if (restore.length) {
        edited = edited.filter((field) => !restore.includes(field as never))
        const mapped = await mappedValues(draft, edited, await buildMappingContext())
        Object.assign(set, Object.fromEntries(Object.entries(mapped.set).filter(([key]) => restore.some((field) => key === field || key.startsWith(field)))))
        origins = { ...origins, ...Object.fromEntries(Object.entries(mapped.origins).filter(([key]) => restore.includes(key as never))) }
    }
    const after = await TaskDraft.findOneAndUpdate({ _id: draft._id }, { $set: { ...set, edited, origins } }, { returnDocument: "after" }).lean()
    await recordAudit({
        userId: actorId,
        entidade: GITHUB_AUDIT.draft,
        entidadeId: String(draft._id),
        acao: input.assignee !== undefined && Object.keys(changes).length === 1 ? AcaoAuditoria.ATRIBUIR : AcaoAuditoria.ATUALIZAR,
        antes: { codigo: draftCode(draft.repo, draft.number), ...auditFields(Object.fromEntries(Object.keys(set).map((key) => [key, draft[key as keyof ITaskDraft]])) as Partial<ITaskDraft>) },
        depois: { codigo: draftCode(draft.repo, draft.number), ...auditFields(set), ...(restore.length ? { restaurados: restore } : {}) },
    })
    await publishBoardUpdated([taskId])
    return draftToTask((after ?? draft) as DraftDoc)
}

/** Move o rascunho entre colunas pessoais (o Go! Sipal não é chamado). */
export async function moveDraft(taskId: string, columnKey: string, order: number | undefined, actorId: string, options: { publish?: boolean } = {}): Promise<null> {
    const draft = await loadDraft(taskId)
    assertPending(draft)
    if (!isCustomColumnKey(columnKey)) throw new DomainError(400, "Para levar o rascunho a uma coluna do Go! Sipal, envie-o (com confirmação)", "DRAFT_SEND_REQUIRED")
    const column = await TaskBoardColumn.findOne({ key: columnKey }).select({ name: 1 }).lean()
    if (!column) throw new DomainError(404, "Coluna não encontrada", "COLUMN_NOT_FOUND")
    const position = order ?? (draft.columnKey === columnKey ? draft.order : await nextOrder(columnKey))
    await TaskDraft.updateOne({ _id: draft._id }, { $set: { columnKey, order: position } })
    if (draft.columnKey !== columnKey) {
        const previous = await TaskBoardColumn.findOne({ key: draft.columnKey }).select({ name: 1 }).lean()
        await recordAudit({
            userId: actorId,
            entidade: GITHUB_AUDIT.draft,
            entidadeId: String(draft._id),
            acao: AcaoAuditoria.MOVER,
            antes: { codigo: draftCode(draft.repo, draft.number), coluna: previous?.name ?? draft.columnKey },
            depois: { codigo: draftCode(draft.repo, draft.number), coluna: column.name },
        })
    }
    if (options.publish !== false) await publishBoardUpdated([taskId])
    return null
}

export async function discardDraft(taskId: string, actorId: string, options: { publish?: boolean } = {}): Promise<void> {
    const draft = await loadDraft(taskId)
    if (draft.state === "discarded") return
    assertPending(draft)
    await TaskDraft.updateOne({ _id: draft._id }, { $set: { state: "discarded", discardedAt: new Date() } })
    await recordAudit({ userId: actorId, entidade: GITHUB_AUDIT.draft, entidadeId: String(draft._id), acao: AcaoAuditoria.EXCLUIR, antes: { codigo: draftCode(draft.repo, draft.number), titulo: draft.title } })
    if (options.publish !== false) await publishBoardUpdated([taskId])
    await publishGithubUpdated("drafts")
}

/** Volta para o quadro: a coluna em que estava (se ainda existir) ou a de entrada do vínculo. */
export async function restoreDraft(taskId: string, actorId: string, options: { publish?: boolean } = {}): Promise<TaskDto> {
    const draft = await loadDraft(taskId)
    if (draft.state !== "discarded") return draftToTask(draft)
    const link = await GithubRepoLink.findOne({ repo: draft.repo }).lean()
    const exists = await TaskBoardColumn.exists({ key: draft.columnKey })
    const columnKey = exists ? draft.columnKey : (link?.entryColumnKey ?? draft.columnKey)
    if (!(await TaskBoardColumn.exists({ key: columnKey }))) throw new DomainError(409, "A coluna do rascunho não existe mais: crie uma coluna pessoal e vincule-a ao repositório", "COLUMN_NOT_FOUND")
    const after = await TaskDraft.findOneAndUpdate({ _id: draft._id }, { $set: { state: "draft", discardedAt: null, columnKey, order: await nextOrder(columnKey) } }, { returnDocument: "after" }).lean()
    await recordAudit({ userId: actorId, entidade: GITHUB_AUDIT.draft, entidadeId: String(draft._id), acao: AcaoAuditoria.ATUALIZAR, antes: { codigo: draftCode(draft.repo, draft.number), descartado: true }, depois: { descartado: false } })
    if (options.publish !== false) await publishBoardUpdated([taskId])
    await publishGithubUpdated("drafts")
    return draftToTask((after ?? draft) as DraftDoc)
}

export async function listDiscardedDrafts(): Promise<DiscardedDraftDto[]> {
    await dbConnect()
    const drafts = await TaskDraft.find({ state: "discarded" }).sort({ discardedAt: -1 }).limit(500).lean()
    return drafts.map((draft) => ({
        id: draftTaskId(String(draft._id)),
        code: draftCode(draft.repo, draft.number),
        repo: draft.repo,
        number: draft.number,
        title: draft.title,
        issueUrl: draft.issueUrl,
        productName: draft.productName,
        discardedAt: draft.discardedAt ? new Date(draft.discardedAt).toISOString() : null,
    }))
}

// ---------------------------------------------------------------------------
// Envio ao Go! Sipal
// ---------------------------------------------------------------------------

const IMAGE_CONCURRENCY = 4

/** Baixa as imagens da issue e anexa à tarefa. Devolve o nome do anexo por índice da imagem. */
async function attachImages(draft: DraftDoc, goTaskId: string): Promise<{ files: Map<number, string>; total: number }> {
    const images = extractIssueImages(draft.body ?? "")
    const files = new Map<number, string>()
    if (images.length === 0) return { files, total: 0 }
    const signed = await issueImageSources(draft)
    const sources = signed.length === images.length ? signed : images.map((image) => image.url)
    let next = 0
    const worker = async () => {
        while (next < images.length) {
            const index = next++
            const file = (await githubDownload(sources[index]!)) ?? (sources[index] !== images[index]!.url ? await githubDownload(images[index]!.url) : null)
            if (!file) continue
            const name = `issue-${draft.number}-imagem-${index + 1}.${imageExtension(file.contentType)}`
            try {
                await uploadGoAttachment(goTaskId, { name, type: file.contentType, bytes: file.bytes })
                files.set(index, name)
            } catch {
                // Falha num anexo mantém o link original na descrição.
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, images.length) }, worker))
    return { files, total: images.length }
}

/** Tarefa do produto que já cita esta issue (retomada de um envio interrompido). */
async function findSentTask(draft: DraftDoc): Promise<TaskDto | null> {
    try {
        const tasks = await listGoProductTasks(draft.productId)
        return tasks.find((item) => item.text.includes(draft.issueUrl) || mentionsIssue(item.text, draft.repo, draft.number))?.task ?? null
    } catch {
        return null
    }
}

/**
 * Cria a tarefa no Go! Sipal a partir do rascunho (status escolhido + valores do modal), anexa as
 * imagens, comenta na issue (opcional) e vincula issue ↔ tarefa. Seguro contra duplicação: grava
 * `sending` antes e, numa nova tentativa, procura a tarefa pela URL da issue.
 */
export async function sendDraft(taskId: string, input: SendDraftInput, actorId: string, options: { publish?: boolean } = {}): Promise<SendDraftResultDto> {
    let draft = await loadDraft(taskId)
    assertPending(draft)
    const status = input.status as TaskStatus
    const { status: _status, ...overrides } = input
    void _status
    const { set, fields } = setFromInput(overrides)
    if (fields.length) {
        const edited = [...new Set([...(draft.edited ?? []), ...fields])]
        draft = { ...draft, ...set, edited }
        await TaskDraft.updateOne({ _id: draft._id }, { $set: { ...set, edited } })
    }

    let created: TaskDto | null = draft.state === "sending" ? await findSentTask(draft) : null
    const retried = created !== null
    if (!created) {
        await TaskDraft.updateOne({ _id: draft._id }, { $set: { state: "sending", sendingAt: new Date() } })
        const author = { url: draft.issueUrl, authorLogin: draft.author.login, authorName: draft.author.name ?? null, createdAt: draft.issueCreatedAt ?? null }
        try {
            created = await createGoTask({
                title: draft.title,
                description: buildTaskDescription(draft.body ?? "", author),
                product: draft.productId,
                status,
                taskType: draft.taskType,
                priority: draft.priority,
                ...(draft.assigneeId ? { assignee: draft.assigneeId } : {}),
                ...(draft.workPackageId ? { workPackage: draft.workPackageId } : {}),
            })
        } catch (error) {
            // Sem resposta (timeout/rede): pode ter criado. Fica `sending` e a próxima tentativa procura.
            const unknownOutcome = error instanceof GoSipalError && error.code === "UNAVAILABLE"
            if (!unknownOutcome) await TaskDraft.updateOne({ _id: draft._id }, { $set: { state: "draft", sendingAt: null } })
            await publishBoardUpdated([taskId])
            const { toTaskDomainError } = await import("@/features/tasks/server/service")
            toTaskDomainError(error)
        }
        if (!created) {
            await TaskDraft.updateOne({ _id: draft._id }, { $set: { state: "draft", sendingAt: null } })
            throw new DomainError(502, "O Go! Sipal não devolveu a tarefa criada", "GO_SIPAL_UNAVAILABLE")
        }
    }

    // Imagens e comentário: falhas não desfazem a tarefa criada.
    let images = { total: 0, attached: 0 }
    if (!retried) {
        try {
            const { files, total } = await attachImages(draft, created.id)
            images = { total, attached: files.size }
            if (files.size) {
                const body = replaceImagesWithAttachments(draft.body ?? "", extractIssueImages(draft.body ?? ""), files)
                await updateGoTaskDescription(created.id, buildTaskDescription(body, { url: draft.issueUrl, authorLogin: draft.author.login, authorName: draft.author.name ?? null, createdAt: draft.issueCreatedAt ?? null }))
            }
        } catch {
            // Mantém a descrição original (links das imagens).
        }
    }
    const config = await getIntegrationConfig("github")
    let commented = false
    if (config.commentOnCreate && !retried) {
        const goConfig = await getIntegrationConfig("go_sipal")
        try {
            await githubRequest(`/repos/${draft.repo}/issues/${draft.number}/comments`, {
                method: "POST",
                body: { body: `Tarefa **${created.code}** criada no Go! Sipal: ${goSipalTaskUrl(goConfig.baseUrl, created.id)}` },
                label: "comentar na issue",
            })
            commented = true
        } catch {
            // Comentário é opcional.
        }
    }

    await TaskDraft.updateOne({ _id: draft._id }, { $set: { state: "sent", sentAt: new Date(), goTaskId: created.id, goTaskCode: created.code, images } })
    await GithubIssueLink.updateOne(
        { repo: draft.repo, number: draft.number },
        {
            $set: { url: draft.issueUrl, goTaskId: created.id, goTaskCode: created.code, source: "draft", issueState: draft.issueState, issueStateReason: draft.issueStateReason ?? null },
            $setOnInsert: { pendingCommitUntil: null, notice: null },
        },
        { upsert: true },
    )
    await recordAudit({
        userId: actorId,
        entidade: GITHUB_AUDIT.draft,
        entidadeId: String(draft._id),
        acao: AcaoAuditoria.CRIAR,
        antes: { codigo: draftCode(draft.repo, draft.number), issue: draft.issueUrl },
        depois: {
            tarefa: created.code,
            status: TASK_STATUS_LABELS[status],
            tipo: TASK_TYPE_LABELS[draft.taskType as TaskType] ?? draft.taskType,
            prioridade: TASK_PRIORITY_LABELS[draft.priority as TaskPriority] ?? draft.priority,
            responsavel: draft.assigneeName ?? null,
            imagens: `${images.attached}/${images.total}`,
            comentario: commented,
            ...(retried ? { retomado: true } : {}),
        },
    })
    if (options.publish !== false) await publishBoardUpdated([taskId, created.id])
    return { taskId: created.id, code: created.code, images, commented }
}

