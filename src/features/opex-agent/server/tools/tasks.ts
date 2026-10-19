import { z } from "zod"
import { createTaskWithIssue } from "@/features/github/server/task-issue"
import { pushTaskToIssue } from "@/features/github/server/task-sync"
import { loadTaskTagsSettings } from "@/features/ai/server/settings"
import { TASK_AGENTIC_FLOWS, TASK_PRIORITIES, TASK_TYPES } from "@/features/tasks/constants"
import { applyTaskFilters, DEFAULT_TASK_FILTERS } from "@/features/tasks/filters"
import { createTaskSchema, moveTaskSchema, updateTaskEstimateSchema, updateTaskSchema } from "@/features/tasks/schemas"
import { getBoard } from "@/features/tasks/server/columns"
import { addComment, deleteTask, getTask, getTaskOptions, listTasks, moveTask, setTaskArchived, updateTask, updateTaskEstimate } from "@/features/tasks/server/service"
import { runAfterResponse } from "@/lib/after-response"
import { getLocalUser } from "@/lib/local-user"
import { clipText, collectFeatureStream, resolveTask, slimTask, taskRefSchema } from "./helpers"
import { defineTool, OpexToolError } from "./define"

const LIST_LIMIT_MAX = 200

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
            "Repositórios (projetos, com id, sigla e repo do GitHub), colunas do quadro (chave, nome e descrição, na ordem), tipos, prioridades, fluxos da mesa e a taxonomia de tags. Use para descobrir o projeto e a coluna certos antes de criar tarefas ou prévias.",
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
            "Cria a tarefa diretamente no Opex, com a issue no GitHub do repositório. Prefira o fluxo de prévia (create_preview) quando o usuário descrever o pedido em linguagem natural.",
        input: z.object({
            projectId: z.string().describe("Id do projeto (de get_task_options)"),
            columnId: z.string().describe("Chave da coluna (de get_task_options)"),
            title: z.string(),
            description: z.string().optional().describe("Markdown"),
            taskType: z.enum(TASK_TYPES).nullable().optional(),
            priority: z.enum(TASK_PRIORITIES).optional(),
        }),
        summarize: (input) => `Criar a tarefa "${input.title}" (com issue no GitHub)`,
        execute: async (input, context) => slimTask(await createTaskWithIssue(createTaskSchema.parse(input), context.actorId)),
    }),
    defineTool({
        name: "update_task",
        group: "tasks",
        label: "Editar tarefa",
        risk: "write",
        description: "Altera título, descrição, especificação técnica, tipo, prioridade, projeto ou o fluxo da mesa (preview/auto_pr; null = padrão da central) de uma tarefa. Envie só os campos que mudam.",
        input: z.object({
            task: taskRefSchema,
            title: z.string().optional(),
            description: z.string().optional(),
            technicalSpec: z.string().optional(),
            taskType: z.enum(TASK_TYPES).nullable().optional(),
            priority: z.enum(TASK_PRIORITIES).optional(),
            projectId: z.string().optional(),
            agenticFlow: z.enum(TASK_AGENTIC_FLOWS).nullable().optional(),
        }),
        summarize: (input) => `Editar a tarefa ${input.task}`,
        execute: async ({ task, ...rest }, context) => {
            const { id } = await resolveTask(task)
            const parsed = updateTaskSchema.parse(rest)
            await updateTask(id, parsed, context.actorId)
            if (parsed.title !== undefined || parsed.description !== undefined) refreshTaskAi(id)
            return { ok: true, id }
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
        name: "understand_task",
        group: "tasks",
        label: "Entender tarefa",
        risk: "read",
        description: 'Gera com a feature de IA "Entender tarefas" uma explicação da tarefa (resumo, o que fazer, riscos e dúvidas).',
        input: z.object({ task: taskRefSchema }),
        execute: async ({ task }, context) => {
            const { prepareUnderstandTask, runUnderstandTask } = await import("@/features/ai/server/understand-task")
            const { id } = await resolveTask(task)
            const { text } = await collectFeatureStream(runUnderstandTask(await prepareUnderstandTask(id), context.signal))
            return { explanation: text }
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
