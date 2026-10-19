import type { ClientActor } from "@/features/auth/server/context"
import { DomainError } from "@/lib/api/route"
import { clientAttachmentActor, type AttachmentActor } from "@/features/tasks/attachments/server/actor"
import { clientScope } from "@/features/orcamentos/server/drafts"
import { listClientTasks } from "@/features/orcamentos/server/portal"
import type { ClienteOrcamentoDoc } from "@/features/orcamentos/server/token"
import type { ClienteTaskDetailDto, ClienteTaskDto, OrcamentoDraftDto } from "@/features/orcamentos/types"
import { OpexToolError, type OpexToolContext } from "../tools/define"
import { OWNER_SCOPE } from "../scope"

/**
 * Apoio das ferramentas do portal: todas exigem o **escopo do cliente** e trabalham só com o
 * `ClientActor` revalidado no servidor. Não existe caminho de ferramenta do portal sem escopo.
 */

export function requireClientActor(context: OpexToolContext): ClientActor {
    const scope = context.scope ?? OWNER_SCOPE
    if (scope.kind !== "client") throw new OpexToolError("Esta ferramenta só existe no portal do cliente.")
    return scope.actor
}

/** Doc do cliente em escopo (o que os serviços do portal esperam). */
export function clientOf(context: OpexToolContext): ClienteOrcamentoDoc {
    return requireClientActor(context).client
}

/** Escopo dos rascunhos de orçamento (pedidos do cliente). */
export function draftScopeOf(context: OpexToolContext) {
    return clientScope(requireClientActor(context).client)
}

/** Ator dos anexos (autor = usuário do portal). */
export function attachmentsActorOf(context: OpexToolContext): AttachmentActor {
    const actor = requireClientActor(context)
    return clientAttachmentActor({ clientId: String(actor.client._id), userId: actor.userId, name: actor.displayName })
}

/** Tarefa do cliente em formato enxuto para o modelo. */
export function slimClientTask(task: ClienteTaskDto) {
    return {
        id: task.id,
        code: task.code,
        title: task.title,
        column: task.columnId,
        type: task.taskType,
        priority: task.priority,
        project: task.project?.name ?? null,
        repo: task.project?.repo ?? null,
        summary: task.summary ?? null,
        estimate: task.estimate,
        archived: task.archived,
        updatedAt: task.updatedAt,
    }
}

/** Detalhe do cliente, com os textos longos cortados. */
export function slimClientTaskDetail(task: ClienteTaskDetailDto) {
    return {
        ...slimClientTask(task),
        description: clip(task.description, 12_000),
        technicalSpec: clip(task.technicalSpec, 12_000),
        comments: task.comments.slice(-30),
        attachmentsCount: task.attachmentsCount,
    }
}

/**
 * Prévia no formato do cliente: **sem** horas reais, modelo ou cliente da estimativa (dados
 * internos do dono). O que o portal mostra é a estimativa com horas infladas e faturamento.
 */
export function slimClientPreview(draft: OrcamentoDraftDto) {
    return {
        id: draft.id,
        projectId: draft.projectId,
        projectName: draft.projectName,
        description: clip(draft.description, 12_000),
        correction: draft.correction,
        preview: draft.preview,
        tags: draft.tags,
        status: draft.status,
        taskId: draft.taskId,
        estimate: draft.estimate ? { clientHours: draft.estimate.clientHours, billingBRL: draft.estimate.billingBrl } : null,
        createdAt: draft.createdAt,
    }
}

/** Acha a tarefa do cliente por id ou código; fora do escopo do cliente é "não encontrada". */
export async function findClientTask(actor: ClientActor, ref: string): Promise<ClienteTaskDto> {
    const list = await listClientTasks(actor.client, true)
    const found = list.tasks.find((item) => item.id === ref || item.code.toLowerCase() === ref.toLowerCase())
    if (!found) throw new OpexToolError(`Tarefa "${ref}" não encontrada. Use list_tasks para achar o código certo.`)
    return found
}

export function clip(value: string | null | undefined, max: number): string | null {
    if (value == null) return null
    return value.length > max ? `${value.slice(0, max)}…(+${(value.length - max).toLocaleString("pt-BR")} caracteres)` : value
}

/** Recusa id de tarefa que não é do cliente antes de qualquer efeito (não revela existência). */
export function notFound(entity: string): never {
    throw new DomainError(404, `${entity} não encontrado`, "NOT_FOUND")
}
