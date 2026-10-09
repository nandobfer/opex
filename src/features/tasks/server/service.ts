import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { appChannel, publishToChannels } from "@/lib/pusher/channels"
import { GoSipalError, goSipalRequest } from "@/features/go-sipal/client"
import { decodeGoSipalJwt } from "@/features/go-sipal/jwt"
import { FINAL_TASK_STATUS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, TASKS_UPDATED_EVENT } from "../constants"
import type { BulkTaskResult, BulkTasksInput, MoveTaskInput, UpdateTaskInput } from "../schemas"
import type { TaskDetailDto, TaskDto, TaskListDto, TaskOptionsDto } from "../types"
import type { CreatableTaskStatus } from "@/features/github/schemas"
import { DRAFT_SENDABLE_STATUSES, DRAFT_BLOCKED_MESSAGE, isDraftTaskId } from "../drafts"
import { applyLocalStates, clearLocalColumn, columnNameOf, setLocalColumn } from "./columns"
import { toTaskDetailDto, toTaskDto, toTaskList, toTaskOptions } from "./mappers"

/**
 * Tarefas do Centro de Desenvolvimento via rotas internas do Go! Sipal (`/api/dev-center/*`,
 * conferidas em `~/code/sap-painel-lancamento`). Somente servidor.
 */

export const TASK_AUDIT_ENTITY = "TarefaGoSipal"

/** Código de erro das rotas quando falta sessão (a tela mostra "Conectar ao Go! Sipal"). */
export const GO_SIPAL_SESSION_ERROR = "GO_SIPAL_SESSION"

/** `GoSipalError` → resposta da rota (sessão 401, permissão 403, recusa 400, indisponível 502). */
export function toTaskDomainError(error: unknown): never {
    if (error instanceof GoSipalError) {
        if (error.code === "NOT_CONFIGURED" || error.code === "UNAUTHENTICATED") throw new DomainError(401, error.message, GO_SIPAL_SESSION_ERROR)
        if (error.code === "FORBIDDEN") throw new DomainError(403, error.message, "GO_SIPAL_FORBIDDEN")
        if (error.code === "UNAVAILABLE") throw new DomainError(502, error.message, "GO_SIPAL_UNAVAILABLE")
        const status = error.status === 404 ? 404 : 400
        const flags = error.body ? { requiresCommitUrl: error.body.requiresCommitUrl === true, requiresPullRequestUrl: error.body.requiresPullRequestUrl === true } : undefined
        throw new DomainError(status, error.message, status === 404 ? "TASK_NOT_FOUND" : "GO_SIPAL_REJECTED", flags)
    }
    throw error
}

const OBJECT_ID = /^[a-f0-9]{24}$/i

function assertTaskId(id: string): void {
    if (!OBJECT_ID.test(id)) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
}

/** Quadro inteiro (Backlog e Em Produção vêm limitados a 200 pela plataforma). */
export async function fetchAllTasks(options: { includeArchived?: boolean; signal?: AbortSignal } = {}): Promise<TaskDto[]> {
    const query = options.includeArchived ? "?includeArchived=true" : ""
    const body = await goSipalRequest<{ data?: unknown }>(`/api/dev-center/tasks${query}`, { signal: options.signal, label: "listar tarefas" })
    return toTaskList(body?.data)
}

export async function listTasks(includeArchived: boolean): Promise<TaskListDto> {
    const config = await getIntegrationConfig("go_sipal")
    let fetched: TaskDto[]
    try {
        fetched = await fetchAllTasks({ includeArchived })
    } catch (error) {
        toTaskDomainError(error)
    }
    const { tasks, returned } = await applyLocalStates(fetched)
    return {
        tasks: [...(await withIssueRefs(tasks)), ...(await boardDrafts())],
        baseUrl: config.baseUrl,
        currentUserId: (config.token && decodeGoSipalJwt(config.token)?.userId) || null,
        fetchedAt: new Date().toISOString(),
        returned,
    }
}

export async function getTask(id: string): Promise<TaskDetailDto> {
    assertTaskId(id)
    const config = await getIntegrationConfig("go_sipal")
    let body: { data?: unknown }
    try {
        body = await goSipalRequest(`/api/dev-center/tasks/${id}`, { label: "detalhe da tarefa" })
    } catch (error) {
        toTaskDomainError(error)
    }
    const task = toTaskDetailDto(body?.data, config.baseUrl)
    if (!task) throw new DomainError(404, "Tarefa não encontrada", "TASK_NOT_FOUND")
    return (await withIssueRefs((await applyLocalStates([task])).tasks))[0]!
}

/** Issue do GitHub vinculada (botão "Abrir issue"). Falha aqui não derruba a lista. */
async function withIssueRefs<T extends TaskDto>(tasks: T[]): Promise<T[]> {
    const { issueRefsFor } = await import("@/features/github/server/issue-links")
    const refs = await issueRefsFor(tasks.map((task) => task.id))
    return refs.size ? tasks.map((task) => (refs.has(task.id) ? { ...task, issue: refs.get(task.id)! } : task)) : tasks
}

/** Rascunhos (issues do GitHub) pendentes, como cards do quadro. */
async function boardDrafts(): Promise<TaskDto[]> {
    try {
        const { listBoardDrafts } = await import("@/features/github/server/drafts")
        return await listBoardDrafts()
    } catch {
        return []
    }
}

export async function getTaskOptions(): Promise<TaskOptionsDto> {
    const config = await getIntegrationConfig("go_sipal")
    const currentUserId = (config.token && decodeGoSipalJwt(config.token)?.userId) || null
    try {
        const [products, developers] = await Promise.all([
            goSipalRequest<{ data?: unknown }>("/api/dev-center/products", { label: "listar produtos" }),
            goSipalRequest<{ data?: unknown }>("/api/dev-center/developers", { label: "listar desenvolvedores" }),
        ])
        return { ...toTaskOptions(products?.data, developers?.data), currentUserId }
    } catch (error) {
        toTaskDomainError(error)
    }
}

/**
 * Move a tarefa no fluxo (`POST /api/dev-center/tasks/[id]/move`). A plataforma valida a
 * transição (Em Produção é final; Validação exige commit e Aguardando Produção exige PR, exceto
 * tipos sem código) e responde 400 com `requiresCommitUrl`/`requiresPullRequestUrl`.
 */
export async function moveTask(id: string, input: MoveTaskInput, actorId: string, options: { publish?: boolean; skipIssueSync?: boolean } = {}): Promise<TaskDto | null> {
    if (isDraftTaskId(id)) return moveDraftTask(id, input, actorId, options)
    assertTaskId(id)
    if (input.targetColumn) return moveTaskToColumn(id, input.targetColumn, input, actorId, options)
    const targetStatus = input.targetStatus
    if (!targetStatus) throw new DomainError(400, "Informe o status de destino", "VALIDATION_ERROR")
    const previous = input.fromStatus ? { status: input.fromStatus, code: input.code ?? id } : undefined
    if (previous?.status === FINAL_TASK_STATUS && targetStatus !== FINAL_TASK_STATUS) {
        throw new DomainError(400, "Não é possível mover tarefa a partir de 'Em Produção'", "GO_SIPAL_REJECTED")
    }

    // Saindo de uma coluna customizada: some o estado local; status igual = nada a fazer no Go! Sipal.
    const leftColumn = await clearLocalColumn(id)
    if (previous && previous.status === targetStatus && input.order === undefined) {
        if (leftColumn) {
            await recordAudit({
                userId: actorId,
                entidade: TASK_AUDIT_ENTITY,
                entidadeId: id,
                acao: AcaoAuditoria.MOVER,
                antes: { codigo: previous.code, coluna: await columnNameOf(leftColumn), pessoal: true },
                depois: { codigo: previous.code, status: TASK_STATUS_LABELS[targetStatus] },
            })
            if (options.publish !== false) await publishTasksUpdated([id])
        }
        return null
    }
    let body: { data?: unknown }
    try {
        body = await goSipalRequest(`/api/dev-center/tasks/${id}/move`, {
            method: "POST",
            body: {
                targetStatus,
                ...(input.order !== undefined ? { order: input.order } : {}),
                ...(input.commitUrl ? { commitUrl: input.commitUrl } : {}),
                ...(input.pullRequestUrl ? { pullRequestUrl: input.pullRequestUrl } : {}),
            },
            label: "mover tarefa",
        })
    } catch (error) {
        toTaskDomainError(error)
    }
    const task = toTaskDto(body?.data)
    if (!task) throw new DomainError(502, "O Go! Sipal não devolveu a tarefa atualizada", "GO_SIPAL_UNAVAILABLE")

    await recordAudit({
        userId: actorId,
        entidade: TASK_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.MOVER,
        antes: previous ? { codigo: previous.code, ...(leftColumn ? { coluna: await columnNameOf(leftColumn), pessoal: true } : { status: TASK_STATUS_LABELS[previous.status] }) } : undefined,
        depois: {
            codigo: task.code,
            status: TASK_STATUS_LABELS[task.status],
            ...(input.order !== undefined ? { ordem: input.order } : {}),
            ...(input.commitUrl ? { commitUrl: input.commitUrl } : {}),
            ...(input.pullRequestUrl ? { pullRequestUrl: input.pullRequestUrl } : {}),
        },
    })
    if (options.publish !== false) await publishTasksUpdated([id])
    if (!options.skipIssueSync) {
        const { onTaskStatusChanged } = await import("@/features/github/server/issue-links")
        await onTaskStatusChanged(task.id, task.status, task.code)
    }
    return task
}

/** Rascunho: coluna pessoal move; coluna do Go! Sipal criável envia (a tela já confirmou). */
async function moveDraftTask(id: string, input: MoveTaskInput, actorId: string, options: { publish?: boolean }): Promise<null> {
    const drafts = await import("@/features/github/server/drafts")
    if (input.targetColumn) return drafts.moveDraft(id, input.targetColumn, input.order, actorId, options)
    const status = input.targetStatus
    if (!status || !DRAFT_SENDABLE_STATUSES.includes(status)) throw new DomainError(400, DRAFT_BLOCKED_MESSAGE, "DRAFT_STATUS_NOT_ALLOWED")
    await drafts.sendDraft(id, { status: status as CreatableTaskStatus }, actorId, options)
    return null
}

/** Coluna customizada: só nO Opex (o Go! Sipal não é chamado). */
async function moveTaskToColumn(id: string, column: string, input: MoveTaskInput, actorId: string, options: { publish?: boolean }): Promise<null> {
    if (!input.fromStatus) throw new DomainError(400, "Informe o status atual da tarefa no Go! Sipal", "VALIDATION_ERROR")
    const code = input.code ?? null
    const { columnName, previous } = await setLocalColumn(id, column, input.fromStatus, code, input.order)
    if (previous !== column) {
        await recordAudit({
            userId: actorId,
            entidade: TASK_AUDIT_ENTITY,
            entidadeId: id,
            acao: AcaoAuditoria.MOVER,
            antes: { codigo: code ?? id, ...(previous ? { coluna: await columnNameOf(previous), pessoal: true } : { status: TASK_STATUS_LABELS[input.fromStatus] }) },
            depois: { codigo: code ?? id, coluna: columnName, pessoal: true },
        })
    }
    if (options.publish !== false) await publishTasksUpdated([id])
    return null
}

async function publishTasksUpdated(ids: string[]): Promise<void> {
    if (ids.length) await publishToChannels([appChannel()], TASKS_UPDATED_EVENT, { ids })
}

/**
 * Responsável e/ou prioridade (`PUT /api/dev-center/tasks/[id]`; `assignee: null` remove). A
 * resposta da plataforma não traz o produto: a tela recarrega depois.
 */
export async function updateTask(id: string, input: UpdateTaskInput, actorId: string, options: { publish?: boolean } = {}): Promise<void> {
    if (isDraftTaskId(id)) {
        const { updateDraft } = await import("@/features/github/server/drafts")
        await updateDraft(
            id,
            {
                ...(input.priority !== undefined ? { priority: input.priority } : {}),
                ...(input.assignee !== undefined
                    ? { assignee: input.assignee ? { id: input.assignee, name: input.from?.assigneeNameAfter ?? "—", email: input.assigneeEmail ?? null } : null }
                    : {}),
            },
            actorId,
        )
        return
    }
    assertTaskId(id)
    const body: Record<string, unknown> = {}
    if (input.assignee !== undefined) body.assignee = input.assignee
    if (input.priority !== undefined) body.priority = input.priority
    try {
        await goSipalRequest(`/api/dev-center/tasks/${id}`, { method: "PUT", body, label: "atualizar tarefa" })
    } catch (error) {
        toTaskDomainError(error)
    }

    const antes: Record<string, unknown> = { codigo: input.code ?? id }
    const depois: Record<string, unknown> = { codigo: input.code ?? id }
    if (input.assignee !== undefined) {
        antes.responsavel = input.from?.assigneeName ?? input.from?.assignee ?? null
        depois.responsavel = input.from?.assigneeNameAfter ?? input.assignee
    }
    if (input.priority !== undefined) {
        if (input.from?.priority) antes.prioridade = TASK_PRIORITY_LABELS[input.from.priority]
        depois.prioridade = TASK_PRIORITY_LABELS[input.priority]
    }
    await recordAudit({
        userId: actorId,
        entidade: TASK_AUDIT_ENTITY,
        entidadeId: id,
        acao: input.assignee !== undefined && input.priority === undefined ? AcaoAuditoria.ATRIBUIR : AcaoAuditoria.ATUALIZAR,
        antes,
        depois,
    })
    if (options.publish !== false) await publishTasksUpdated([id])
}

/** Arquiva/desarquiva (`POST /api/dev-center/tasks/[id]/archive`). */
export async function setTaskArchived(id: string, archive: boolean, actorId: string, code?: string, options: { publish?: boolean } = {}): Promise<void> {
    assertTaskId(id)
    try {
        await goSipalRequest(`/api/dev-center/tasks/${id}/archive`, { method: "POST", body: { archive }, label: archive ? "arquivar tarefa" : "desarquivar tarefa" })
    } catch (error) {
        toTaskDomainError(error)
    }
    await recordAudit({
        userId: actorId,
        entidade: TASK_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { codigo: code ?? id, arquivada: !archive },
        depois: { codigo: code ?? id, arquivada: archive },
    })
    if (options.publish !== false) await publishTasksUpdated([id])
}

/** Tarefas processadas em paralelo contra o Go! Sipal. */
export const BULK_CONCURRENCY = 4

/**
 * Lote: cada item com a própria ação, `BULK_CONCURRENCY` por vez. Falha de uma tarefa não derruba
 * as outras (resultado por id). Um único `tasks-updated` com as que deram certo.
 */
export async function runBulkTasks(input: BulkTasksInput, actorId: string): Promise<BulkTaskResult[]> {
    const results: BulkTaskResult[] = new Array(input.items.length)
    let next = 0
    const worker = async () => {
        while (next < input.items.length) {
            const index = next++
            const item = input.items[index]!
            try {
                const { action } = item
                if (isDraftTaskId(item.id) && (action.type === "discard" || action.type === "restore" || action.type === "archive")) {
                    const drafts = await import("@/features/github/server/drafts")
                    if (action.type === "restore" || (action.type === "archive" && !action.archive)) await drafts.restoreDraft(item.id, actorId, { publish: false })
                    else await drafts.discardDraft(item.id, actorId, { publish: false })
                } else if (action.type === "discard" || action.type === "restore") {
                    throw new DomainError(400, "Só rascunhos podem ser descartados", "VALIDATION_ERROR")
                } else if (action.type === "move") {
                    const { type, ...move } = action
                    void type
                    await moveTask(item.id, { ...move, fromStatus: item.fromStatus, code: item.code }, actorId, { publish: false })
                } else if (action.type === "local-move") {
                    await moveTask(item.id, { targetColumn: action.column, order: action.order, fromStatus: item.fromStatus, code: item.code }, actorId, { publish: false })
                } else if (action.type === "assign") {
                    await updateTask(item.id, { assignee: action.assignee, code: item.code, from: { assigneeNameAfter: action.assigneeName ?? null } }, actorId, { publish: false })
                } else if (action.type === "priority") {
                    await updateTask(item.id, { priority: action.priority, code: item.code }, actorId, { publish: false })
                } else {
                    await setTaskArchived(item.id, action.archive, actorId, item.code, { publish: false })
                }
                results[index] = { id: item.id, ok: true }
            } catch (error) {
                results[index] = { id: item.id, ok: false, error: error instanceof Error ? error.message : "Falha ao atualizar a tarefa" }
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, input.items.length) }, worker))
    await publishTasksUpdated(results.filter((result) => result.ok).map((result) => result.id))
    return results
}
