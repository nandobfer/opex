import { z } from "zod"
import { createTaskWithIssue } from "@/features/github/server/task-issue"
import { pushTaskToIssue } from "@/features/github/server/task-sync"
import { loadTaskTagsSettings } from "@/features/ai/server/settings"
import { TASK_AGENTIC_FLOWS, TASK_PRIORITIES, TASK_TYPES } from "@/features/tasks/constants"
import { applyTaskFilters, DEFAULT_TASK_FILTERS } from "@/features/tasks/filters"
import { createTaskSchema, moveTaskSchema, taskPluginTargetSchema, updateTaskEstimateSchema, updateTaskSchema } from "@/features/tasks/schemas"
import { firstBoardColumnKey, getBoard } from "@/features/tasks/server/columns"
import {
    addComment,
    assertAssignableClient,
    clientEstimateSnapshot,
    deleteTask,
    findActiveClient,
    findTaskClientRefs,
    getTask,
    getTaskOptions,
    listTasks,
    moveTask,
    setTaskArchived,
    setTaskClient,
    updateTask,
    updateTaskEstimate,
} from "@/features/tasks/server/service"
import type { TaskDto } from "@/features/tasks/types"
import { DomainError } from "@/lib/api/route"
import { runAfterResponse } from "@/lib/after-response"
import { getLocalUser } from "@/lib/local-user"
import { chatFilesToAttachments } from "./files"
import { clipText, collectFeatureStream, isObjectId, objectIdSchema, resolveTask, slimTask, taskRefSchema } from "./helpers"
import { contextSessionId, defineTool, OpexToolError } from "./define"

const LIST_LIMIT_MAX = 200
/** Teto de tarefas por chamada de `set_task_client` (seletor de projeto + lista, já sem repetidas). */
export const SET_CLIENT_BATCH_MAX = 200

const CLIENT_ID_DESCRIPTION = "Cliente de orçamento da tarefa (id de list_clients); precisa estar ativo e ter o projeto da tarefa em projectIds"

interface BatchFailure {
    task: string
    code: string
    error: string
}

function batchFailure(task: string, error: unknown): BatchFailure {
    if (error instanceof DomainError) return { task, code: error.code ?? "ERROR", error: error.message }
    if (error instanceof OpexToolError) return { task, code: "TASK_NOT_FOUND", error: error.message }
    return { task, code: "ERROR", error: error instanceof Error ? error.message : String(error) }
}

/** Resolve códigos/ids/issues em ids (uma leitura da lista para os códigos); as não encontradas viram falha. */
async function resolveTaskRefs(refs: readonly string[]): Promise<{ ids: Map<string, string>; failed: BatchFailure[] }> {
    const ids = new Map<string, string>()
    const failed: BatchFailure[] = []
    let list: TaskDto[] | null = null
    for (const raw of refs) {
        const ref = raw.trim()
        try {
            if (isObjectId(ref)) {
                ids.set(ref.toLowerCase(), ref)
            } else if (ref.includes("#")) {
                const { id } = await resolveTask(ref)
                ids.set(id, ref)
            } else {
                list ??= (await listTasks(true)).tasks
                const found = list.find((task) => task.code.toLowerCase() === ref.toLowerCase())
                if (found) ids.set(found.id, ref)
                else failed.push({ task: ref, code: "TASK_NOT_FOUND", error: `Tarefa "${ref}" não encontrada` })
            }
        } catch (error) {
            failed.push(batchFailure(ref, error))
        }
    }
    return { ids, failed }
}

/** Estimativa inicial da tarefa criada com cliente (o `generatedAt` é gravado pelo `createTask`). */
function creationEstimate(client: Parameters<typeof clientEstimateSnapshot>[0]) {
    const { hours, clientHours, billingBrl, factor, hourlyRate, model } = clientEstimateSnapshot(client, null)
    return { hours, clientHours, billingBrl, factor, hourlyRate, model }
}

/** Título/descrição mudaram: resumo e tags de IA são regenerados em segundo plano (como a rota da tela). */
function refreshTaskAi(id: string): void {
    runAfterResponse("task-summary", async () => {
        const { generateTaskSummary } = await import("@/features/ai/server/task-summary")
        await generateTaskSummary(id)
    })
    runAfterResponse("task-tags", async () => {
        const { generateTaskTags } = await import("@/features/ai/server/task-tags")
        await generateTaskTags(id)
    })
}

export const taskTools = [
    defineTool({
        name: "get_task_options",
        group: "tasks",
        label: "Opções de tarefas",
        risk: "read",
        description:
            "Repositórios (projetos, com id, sigla e repo do GitHub), colunas do quadro (chave, nome e descrição, na ordem), tipos, prioridades, fluxos da mesa e a taxonomia de tags. Use para descobrir o projeto e a coluna certos antes de criar tarefas.",
        input: z.object({}),
        execute: async () => {
            const [options, board, tags] = await Promise.all([getTaskOptions(), getBoard(), loadTaskTagsSettings().catch(() => null)])
            return {
                projects: options.projects,
                columns: board.columns.map((column) => ({ key: column.key, name: column.name, description: column.description })),
                boardOrder: board.layout,
                taskTypes: TASK_TYPES,
                priorities: TASK_PRIORITIES,
                agenticFlows: TASK_AGENTIC_FLOWS,
                tagTaxonomy: tags?.settings.taxonomy ?? [],
            }
        },
    }),
    defineTool({
        name: "list_tasks",
        group: "tasks",
        label: "Listar tarefas",
        risk: "read",
        description:
            "Lista as tarefas com filtros combináveis (busca por código/título/resumo, projeto, coluna, prioridade, tipo, tags). Devolve dados resumidos; use get_task para os detalhes.",
        input: z.object({
            search: z.string().max(200).optional().describe("Texto ou código (busca tolerante a erro de digitação)"),
            projectIds: z.array(z.string()).optional(),
            columns: z.array(z.string()).optional().describe("Chaves de coluna (de get_task_options)"),
            priorities: z.array(z.enum(TASK_PRIORITIES)).optional(),
            types: z.array(z.enum(TASK_TYPES)).optional(),
            tags: z.array(z.string()).optional(),
            includeArchived: z.boolean().optional(),
            limit: z.number().int().min(1).max(LIST_LIMIT_MAX).optional().describe("Padrão 50"),
        }),
        execute: async (input) => {
            const list = await listTasks(input.includeArchived ?? false)
            const filtered = applyTaskFilters(list.tasks, {
                ...DEFAULT_TASK_FILTERS,
                search: input.search ?? "",
                projects: input.projectIds ?? [],
                columns: input.columns ?? [],
                priorities: input.priorities ?? [],
                types: input.types ?? [],
                tags: input.tags ?? [],
                showArchived: input.includeArchived ?? false,
            })
            const limit = input.limit ?? 50
            return { total: filtered.length, returned: Math.min(limit, filtered.length), tasks: filtered.slice(0, limit).map(slimTask) }
        },
    }),
    defineTool({
        name: "get_task",
        group: "tasks",
        label: "Ler tarefa",
        risk: "read",
        description: "Detalhes completos de uma tarefa: descrição, especificação técnica, comentários, histórico, horas apontadas, estimativa e issue do GitHub.",
        input: z.object({ task: taskRefSchema }),
        execute: async ({ task }) => {
            const { id } = await resolveTask(task)
            const detail = await getTask(id)
            return {
                ...slimTask(detail),
                description: clipText(detail.description, 12_000),
                technicalSpec: clipText(detail.technicalSpec, 12_000),
                clientId: detail.clientId,
                estimate: detail.estimate,
                estimateClientName: detail.estimateClientName,
                comments: detail.comments.slice(-30),
                history: detail.history.slice(-30),
                timeLogs: detail.timeLogs.slice(-30),
                totalMinutesLogged: detail.totalTimeLogged,
                attachmentsCount: detail.attachmentsCount,
            }
        },
    }),
    defineTool({
        name: "create_task",
        group: "tasks",
        label: "Criar tarefa",
        risk: "write",
        description:
            "Cria a tarefa diretamente no Opex, com a issue no GitHub do repositório: é o caminho para criar tarefas. Aceita o cliente de orçamento (clientId de list_clients): a tarefa já nasce com o cliente e a estimativa com o fator dele. Antes de chamar, confira se o pedido está minimamente aceitável (o que fazer, onde — tela, rota ou módulo — e quando estará pronto); se algo essencial faltar claramente, pergunte ao usuário uma vez. Se ele responder ou mandar seguir, crie assim mesmo: esta ferramenta nunca recusa por critério vago. Arquivos do chat em chatFileIds viram anexos da tarefa.",
        input: z.object({
            projectId: z.string().describe("Id do projeto (de get_task_options)"),
            columnId: z.string().optional().describe("Chave da coluna (de get_task_options; padrão: a primeira coluna do quadro)"),
            title: z.string(),
            description: z.string().optional().describe("Markdown, com o contexto que o usuário deu"),
            technicalSpec: z.string().optional().describe("Especificação técnica em Markdown (ex.: seções Critérios de aceite e Localização com o que o usuário disse, sem inventar)"),
            taskType: z.enum(TASK_TYPES).nullable().optional().describe('"plugin" (OPE-172): a mesa gera e publica uma versão de plugin, sem PR, build nem deploy; exige pluginTarget'),
            priority: z.enum(TASK_PRIORITIES).optional(),
            pluginTarget: taskPluginTargetSchema
                .nullable()
                .optional()
                .describe('Só no tipo plugin: scope "owner" (app do dono; servidor + interface) ou "client" (portal de um cliente; só interface, com clientId) e, opcionalmente, pluginId de um plugin existente a alterar (list_plugins)'),
            chatFileIds: z.array(z.string()).max(50).optional().describe("fileIds de arquivos do chat a anexar (ex.: prints do problema)"),
            clientId: objectIdSchema.optional().describe(CLIENT_ID_DESCRIPTION),
        }),
        summarize: (input) => `Criar a tarefa "${input.title}" (com issue no GitHub)${input.clientId ? " com cliente" : ""}${input.chatFileIds?.length ? ` com ${input.chatFileIds.length} anexo(s)` : ""}`,
        execute: async ({ chatFileIds, clientId, ...input }, context) => {
            const columnId = input.columnId ?? (await firstBoardColumnKey())
            const parsed = createTaskSchema.parse({ ...input, columnId })
            // O cliente é validado ANTES da issue: cliente inválido não deixa issue órfã no GitHub.
            const client = clientId ? await assertAssignableClient(clientId, parsed.projectId) : null
            const created = client
                ? await createTaskWithIssue(parsed, context.actorId, { clientId: client.id, estimate: creationEstimate(client) })
                : await createTaskWithIssue(parsed, context.actorId)
            const task = { ...slimTask(created), clientId: client?.id ?? null }
            if (!chatFileIds?.length) return task
            const { attached, failed } = await chatFilesToAttachments(contextSessionId(context), chatFileIds, { taskId: task.id })
            return { ...task, attachments: { attached: attached.map((item) => ({ id: item.id, name: item.name })), failed } }
        },
    }),
    defineTool({
        name: "update_task",
        group: "tasks",
        label: "Editar tarefa",
        risk: "write",
        description:
            "Altera título, descrição, especificação técnica, tipo (com o alvo do plugin no tipo plugin), prioridade, projeto, o fluxo da mesa (preview/auto_pr; null = padrão da central) ou o cliente de orçamento (clientId de list_clients; null remove) de uma tarefa. Trocar o cliente recalcula a estimativa preservando as horas reais. Envie só os campos que mudam; para várias tarefas, use set_task_client.",
        input: z.object({
            task: taskRefSchema,
            title: z.string().optional(),
            description: z.string().optional(),
            technicalSpec: z.string().optional(),
            taskType: z.enum(TASK_TYPES).nullable().optional(),
            priority: z.enum(TASK_PRIORITIES).optional(),
            pluginTarget: taskPluginTargetSchema.nullable().optional().describe("Só no tipo plugin: escopo, clientId e pluginId (opcional)"),
            projectId: z.string().optional(),
            agenticFlow: z.enum(TASK_AGENTIC_FLOWS).nullable().optional(),
            clientId: objectIdSchema.nullable().optional().describe(`${CLIENT_ID_DESCRIPTION}; null remove o cliente`),
        }),
        summarize: (input) => `Editar a tarefa ${input.task}${input.clientId === null ? " (remover o cliente)" : input.clientId ? " (definir o cliente)" : ""}`,
        execute: async ({ task, clientId, ...rest }, context) => {
            const { id } = await resolveTask(task)
            const hasTaskFields = Object.values(rest).some((value) => value !== undefined)
            const parsed = hasTaskFields || clientId === undefined ? updateTaskSchema.parse(rest) : null
            if (clientId) {
                // Valida contra o projeto FINAL antes de gravar qualquer campo (não deixa a tarefa pela metade).
                const projectId = parsed?.projectId ?? (await findTaskClientRefs({ ids: [id] }))[0]?.projectId
                if (!projectId) throw new OpexToolError(`Tarefa "${task}" não encontrada. Use list_tasks para achar o código certo.`)
                await assertAssignableClient(clientId, projectId)
            }
            if (parsed) {
                await updateTask(id, parsed, context.actorId)
                if (parsed.title !== undefined || parsed.description !== undefined) refreshTaskAi(id)
            }
            if (clientId === undefined) return { ok: true, id }
            const assigned = await setTaskClient(id, clientId, context.actorId)
            return { ok: true, id, clientId: assigned.clientId, estimate: assigned.estimate }
        },
    }),
    defineTool({
        name: "set_task_client",
        group: "tasks",
        label: "Atribuir cliente",
        risk: "write",
        description: `Atribui (ou remove, com clientId null) o cliente de orçamento de várias tarefas de uma vez: todas as não arquivadas de um projeto (projectId) e/ou uma lista (tasks: códigos, ids ou issues), até ${SET_CLIENT_BATCH_MAX} por chamada. Usa a mesma regra do card Cliente (cliente ativo, com o projeto da tarefa em projectIds) e recalcula a estimativa preservando as horas reais. Tarefas que já estão com o cliente são puladas; uma tarefa inválida não interrompe o lote e volta em failed com o motivo.`,
        input: z.object({
            clientId: objectIdSchema.nullable().describe("Id do cliente (de list_clients); null remove o cliente das tarefas"),
            projectId: objectIdSchema.optional().describe("Aplica a todas as tarefas não arquivadas deste projeto (de get_task_options)"),
            tasks: z.array(taskRefSchema).max(SET_CLIENT_BATCH_MAX).optional().describe("Tarefas específicas (código, id ou issue vinculada)"),
        }),
        summarize: (input) => {
            const target = [input.projectId ? "do projeto" : null, input.tasks?.length ? `${input.tasks.length} tarefa(s)` : null].filter(Boolean).join(" e ")
            return input.clientId ? `Atribuir o cliente às tarefas ${target || "escolhidas"}` : `Remover o cliente das tarefas ${target || "escolhidas"}`
        },
        execute: async ({ clientId, projectId, tasks }, context) => {
            if (!projectId && !tasks?.length) throw new OpexToolError("Informe projectId e/ou tasks para escolher as tarefas.")
            // Cliente inexistente ou inativo falharia em todas: é erro do lote, antes de qualquer gravação.
            if (clientId) await findActiveClient(clientId)
            const resolved = await resolveTaskRefs(tasks ?? [])
            const refs = await findTaskClientRefs({ ids: [...resolved.ids.keys()], projectId })
            if (refs.length > SET_CLIENT_BATCH_MAX) throw new OpexToolError(`O lote tem ${refs.length} tarefas; o máximo é ${SET_CLIENT_BATCH_MAX} por chamada. Divida pela lista de tarefas.`)
            const failed = [...resolved.failed]
            const foundIds = new Set(refs.map((ref) => ref.id))
            for (const [id, ref] of resolved.ids) if (!foundIds.has(id)) failed.push({ task: ref, code: "TASK_NOT_FOUND", error: `Tarefa "${ref}" não encontrada` })
            const updated: string[] = []
            const skipped: string[] = []
            for (const ref of refs) {
                if (ref.clientId === clientId) {
                    skipped.push(ref.code)
                    continue
                }
                try {
                    await setTaskClient(ref.id, clientId, context.actorId)
                    updated.push(ref.code)
                } catch (error) {
                    failed.push(batchFailure(ref.code, error))
                }
            }
            return { clientId, total: refs.length, updated, skipped, failed }
        },
    }),
    defineTool({
        name: "move_task",
        group: "tasks",
        label: "Mover tarefa",
        risk: "write",
        description: "Move a tarefa para outra coluna do quadro (chave de get_task_options).",
        input: z.object({ task: taskRefSchema, targetColumn: z.string() }),
        summarize: (input) => `Mover a tarefa ${input.task} para a coluna ${input.targetColumn}`,
        execute: async ({ task, targetColumn }, context) => {
            const { id } = await resolveTask(task)
            const moved = await moveTask(id, moveTaskSchema.parse({ targetColumn }), context.actorId)
            return moved ? slimTask(moved) : { ok: true, id }
        },
    }),
    defineTool({
        name: "add_comment",
        group: "tasks",
        label: "Comentar",
        risk: "write",
        description: "Adiciona um comentário (Markdown) à tarefa, como o dono.",
        input: z.object({ task: taskRefSchema, content: z.string().trim().min(1).max(5000) }),
        summarize: (input) => `Comentar na tarefa ${input.task}`,
        execute: async ({ task, content }) => {
            const { id } = await resolveTask(task)
            const owner = getLocalUser()
            await addComment(id, content, { id: owner.id, type: "owner", name: owner.name })
            return { ok: true }
        },
    }),
    defineTool({
        name: "set_task_archived",
        group: "tasks",
        label: "Arquivar tarefa",
        risk: "destructive",
        description: "Arquiva ou desarquiva uma tarefa.",
        input: z.object({ task: taskRefSchema, archived: z.boolean() }),
        summarize: (input) => `${input.archived ? "Arquivar" : "Desarquivar"} a tarefa ${input.task}`,
        execute: async ({ task, archived }, context) => {
            const { id } = await resolveTask(task)
            await setTaskArchived(id, archived, context.actorId)
            return { ok: true }
        },
    }),
    defineTool({
        name: "delete_task",
        group: "tasks",
        label: "Excluir tarefa",
        risk: "destructive",
        description: "Exclui a tarefa definitivamente (comentários, apontamentos e anexos). Prefira arquivar.",
        input: z.object({ task: taskRefSchema }),
        summarize: (input) => `Excluir definitivamente a tarefa ${input.task}`,
        execute: async ({ task }, context) => {
            const { id } = await resolveTask(task)
            await deleteTask(id, context.actorId)
            return { ok: true }
        },
    }),
    defineTool({
        name: "sync_task_issue",
        group: "tasks",
        label: "Sincronizar issue",
        risk: "write",
        description: "Envia a tarefa (título, descrição, tipo/prioridade como labels e aberta/fechada) para a issue do GitHub vinculada.",
        input: z.object({ task: taskRefSchema }),
        summarize: (input) => `Atualizar a issue do GitHub da tarefa ${input.task}`,
        execute: async ({ task }) => {
            const { id } = await resolveTask(task)
            const result = await pushTaskToIssue(id)
            if (result.error) throw new OpexToolError(result.error)
            if (!result.pushed) throw new OpexToolError("A tarefa não tem issue do GitHub vinculada")
            return result
        },
    }),
    defineTool({
        name: "generate_task_summary",
        group: "tasks",
        label: "Gerar resumo",
        risk: "write",
        description: 'Gera (e salva) o resumo de 1 linha da tarefa com a feature "Resumos de tarefas".',
        input: z.object({ task: taskRefSchema }),
        summarize: (input) => `Gerar o resumo da tarefa ${input.task}`,
        execute: async ({ task }, context) => {
            const { prepareTaskSummary, runTaskSummary } = await import("@/features/ai/server/task-summary")
            const { id } = await resolveTask(task)
            const { text } = await collectFeatureStream(runTaskSummary(await prepareTaskSummary(id), context.signal))
            return { summary: text.trim() }
        },
    }),
    defineTool({
        name: "generate_task_tags",
        group: "tasks",
        label: "Gerar tags",
        risk: "write",
        description: 'Classifica (e salva) as tags da tarefa com a feature "Tags de tarefas".',
        input: z.object({ task: taskRefSchema }),
        summarize: (input) => `Gerar as tags da tarefa ${input.task}`,
        execute: async ({ task }) => {
            const { prepareTaskTags, runTaskTags } = await import("@/features/ai/server/task-tags")
            const { id } = await resolveTask(task)
            return { tags: await runTaskTags(await prepareTaskTags(id)) }
        },
    }),
    defineTool({
        name: "estimate_task",
        group: "tasks",
        label: "Estimar horas",
        risk: "write",
        description: 'Estima (e salva) as horas de execução da tarefa com a feature "Estimar prazos" (ancorada nas horas reais das tarefas semelhantes).',
        input: z.object({ task: taskRefSchema }),
        summarize: (input) => `Estimar as horas da tarefa ${input.task}`,
        execute: async ({ task }, context) => {
            const { prepareTaskEstimate, runTaskEstimate } = await import("@/features/tasks/server/estimate")
            const { id } = await resolveTask(task)
            const { done } = await collectFeatureStream(runTaskEstimate(await prepareTaskEstimate(id), context.actorId, context.signal))
            if (!done) throw new OpexToolError("A estimativa não terminou")
            return { estimate: done.estimate }
        },
    }),
    defineTool({
        name: "set_task_estimate",
        group: "tasks",
        label: "Definir estimativa",
        risk: "write",
        description: "Define manualmente as horas estimadas da tarefa (as horas do cliente e o faturamento são recalculados pelo servidor).",
        input: z.object({ task: taskRefSchema, hours: z.number() }),
        summarize: (input) => `Definir a estimativa da tarefa ${input.task} em ${input.hours} h`,
        execute: async ({ task, hours }, context) => {
            const { id } = await resolveTask(task)
            return updateTaskEstimate(id, updateTaskEstimateSchema.parse({ hours }), context.actorId)
        },
    }),
]
