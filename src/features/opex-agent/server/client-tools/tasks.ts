import { z } from "zod"
import { TASK_PRIORITIES, TASK_TYPES } from "@/features/tasks/constants"
import { addClientComment, getClientTask, listClientTasks, setClientTaskPriority } from "@/features/orcamentos/server/portal"
import { defineTool } from "../tools/define"
import { clientOf, findClientTask, requireClientActor, slimClientTask, slimClientTaskDetail } from "./helpers"

const LIST_LIMIT_MAX = 100

const taskRef = z.string().trim().min(1).max(60).describe("Código da tarefa (ex.: OPX-123) ou id")

export const clientTaskTools = [
    defineTool({
        name: "list_tasks",
        group: "tasks",
        label: "Listar tarefas",
        risk: "read",
        description:
            "Lista as tarefas do cliente (só dos repositórios permitidos) com filtros combináveis: busca por código/título/resumo, coluna, prioridade, tipo e arquivadas. Devolve dados resumidos; use get_task para os detalhes.",
        input: z.object({
            search: z.string().max(200).optional().describe("Texto ou código (sem diferenciar maiúsculas)"),
            columns: z.array(z.string()).optional().describe("Chaves de coluna (de get_portal_overview)"),
            priorities: z.array(z.enum(TASK_PRIORITIES)).optional(),
            types: z.array(z.enum(TASK_TYPES)).optional(),
            includeArchived: z.boolean().optional(),
            limit: z.number().int().min(1).max(LIST_LIMIT_MAX).optional().describe("Padrão 50"),
        }),
        execute: async (input, context) => {
            const client = clientOf(context)
            const list = await listClientTasks(client, input.includeArchived ?? false)
            const search = input.search?.trim().toLowerCase()
            const filtered = list.tasks.filter((task) => {
                if (search && ![task.code, task.title, task.summary ?? ""].some((value) => value.toLowerCase().includes(search))) return false
                if (input.columns?.length && !input.columns.includes(task.columnId)) return false
                if (input.priorities?.length && !input.priorities.includes(task.priority)) return false
                if (input.types?.length && (!task.taskType || !input.types.includes(task.taskType))) return false
                return true
            })
            const limit = input.limit ?? 50
            return { total: filtered.length, returned: Math.min(limit, filtered.length), tasks: filtered.slice(0, limit).map(slimClientTask) }
        },
    }),
    defineTool({
        name: "get_task",
        group: "tasks",
        label: "Ler tarefa",
        risk: "read",
        description: "Detalhes de uma tarefa do cliente: descrição, especificação técnica e comentários (sem dados internos do dono).",
        input: z.object({ task: taskRef }),
        execute: async ({ task }, context) => {
            const actor = requireClientActor(context)
            const found = await findClientTask(actor, task)
            return slimClientTaskDetail(await getClientTask(actor.client, found.id))
        },
    }),
    defineTool({
        name: "add_comment",
        group: "tasks",
        label: "Comentar tarefa",
        risk: "write",
        description: "Comenta numa tarefa do cliente como o usuário do portal. O comentário fica visível para o dono e o cliente.",
        input: z.object({ task: taskRef, content: z.string().trim().min(1).max(10_000) }),
        summarize: (input) => `Comentar na tarefa ${input.task}`,
        execute: async ({ task, content }, context) => {
            const actor = requireClientActor(context)
            const found = await findClientTask(actor, task)
            await addClientComment(actor.client, found.id, content, { id: actor.userId, name: actor.displayName })
            return { id: found.id, code: found.code, commented: true }
        },
    }),
    defineTool({
        name: "set_task_priority",
        group: "tasks",
        label: "Alterar prioridade",
        risk: "write",
        description: "Altera a prioridade de uma tarefa do cliente (a mudança também chega ao quadro do dono e à issue do GitHub).",
        input: z.object({ task: taskRef, priority: z.enum(TASK_PRIORITIES) }),
        summarize: (input) => `Alterar a prioridade da tarefa ${input.task}`,
        execute: async ({ task, priority }, context) => {
            const actor = requireClientActor(context)
            const found = await findClientTask(actor, task)
            await setClientTaskPriority(actor.client, found.id, priority, actor.userId)
            return { id: found.id, code: found.code, priority }
        },
    }),
]
