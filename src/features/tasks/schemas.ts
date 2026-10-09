import { z } from "zod"
import { COLUMN_COLORS, COLUMN_ICON_KEYS, CUSTOM_COLUMN_KEY } from "./board"
import { isValidCommitUrl, isValidPullRequestUrl, TASK_PRIORITIES, TASK_STATUSES } from "./constants"
import { DRAFT_TASK_ID } from "./drafts"

const customColumnKey = z.string().regex(CUSTOM_COLUMN_KEY, "Coluna inválida")

/**
 * Mover tarefa (`POST /api/tasks/[id]/move`): para um status do Go! Sipal (`targetStatus`, mesmas
 * regras de URL da plataforma) OU para uma coluna customizada (`targetColumn`, só nO Opex).
 */
const moveTaskObject = z.object({
    targetStatus: z.enum(TASK_STATUSES).optional(),
    targetColumn: customColumnKey.optional(),
    order: z.number().finite().optional(),
    /** Status e código vistos pela tela antes de mover (auditoria e bloqueio de "Em Produção"). */
    fromStatus: z.enum(TASK_STATUSES).optional(),
    code: z.string().trim().max(40).optional(),
    commitUrl: z
        .string()
        .trim()
        .refine(isValidCommitUrl, "Informe o link de um commit (GitHub, GitLab ou Bitbucket)")
        .optional(),
    pullRequestUrl: z
        .string()
        .trim()
        .refine(isValidPullRequestUrl, "Informe o link de um Pull Request do GitHub ou Merge Request do GitLab")
        .optional(),
})
export const moveTaskSchema = moveTaskObject.refine((value) => Boolean(value.targetStatus) !== Boolean(value.targetColumn), "Informe o status do Go! Sipal ou a coluna customizada")
export type MoveTaskInput = z.input<typeof moveTaskSchema>

/** Formulário do diálogo de URL exigida. */
export const commitUrlFormSchema = z.object({ url: moveTaskObject.shape.commitUrl.unwrap() })
export const pullRequestUrlFormSchema = z.object({ url: moveTaskObject.shape.pullRequestUrl.unwrap() })

/** Coluna customizada (criar/editar). Mesmo schema no formulário e na API. */
export const columnInputSchema = z.object({
    name: z.string().trim().min(1, "Informe o nome").max(40, "Máximo de 40 caracteres"),
    color: z.enum(COLUMN_COLORS),
    icon: z.enum(COLUMN_ICON_KEYS),
    description: z.string().trim().max(200, "Máximo de 200 caracteres"),
    wipLimit: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(1, "Mínimo 1").max(999, "Máximo 999").nullable(),
})
export type ColumnInput = z.infer<typeof columnInputSchema>

export const createColumnSchema = columnInputSchema.extend({
    /** Cria logo depois desta coluna (sem: no fim). */
    afterKey: z.string().max(60).nullable().optional(),
})
export type CreateColumnInput = z.infer<typeof createColumnSchema>

export const reorderColumnsSchema = z.object({ order: z.array(z.string().max(60)).min(1).max(100) })

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Identificador inválido")
const code = z.string().trim().max(40).optional()

/**
 * Alterar responsável e/ou prioridade (`PATCH /api/tasks/[id]`). `assignee: null` remove o
 * responsável. `from` = valores vistos pela tela (auditoria antes/depois).
 */
export const updateTaskSchema = z
    .object({
        assignee: objectId.nullable().optional(),
        /** Rascunho: nome e e-mail do responsável (o rascunho não consulta o Go! Sipal). */
        assigneeEmail: z.string().max(200).nullable().optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        code,
        from: z
            .object({
                assignee: z.string().nullable().optional(),
                assigneeName: z.string().max(120).nullable().optional(),
                assigneeNameAfter: z.string().max(120).nullable().optional(),
                priority: z.enum(TASK_PRIORITIES).optional(),
            })
            .optional(),
    })
    .refine((value) => value.assignee !== undefined || value.priority !== undefined, "Informe o responsável ou a prioridade")
export type UpdateTaskInput = z.input<typeof updateTaskSchema>

/** Ação de uma tarefa num lote (`POST /api/tasks/bulk`). */
export const bulkTaskActionSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("move"),
        targetStatus: z.enum(TASK_STATUSES),
        order: moveTaskObject.shape.order,
        commitUrl: moveTaskObject.shape.commitUrl,
        pullRequestUrl: moveTaskObject.shape.pullRequestUrl,
    }),
    /** Coluna customizada: só nO Opex, sem chamar o Go! Sipal. */
    z.object({ type: z.literal("local-move"), column: customColumnKey, order: z.number().finite().optional() }),
    z.object({ type: z.literal("assign"), assignee: objectId.nullable(), assigneeName: z.string().max(120).nullable().optional() }),
    z.object({ type: z.literal("priority"), priority: z.enum(TASK_PRIORITIES) }),
    z.object({ type: z.literal("archive"), archive: z.boolean() }),
    /** Rascunhos (issues do GitHub): descartar e restaurar. */
    z.object({ type: z.literal("discard") }),
    z.object({ type: z.literal("restore") }),
])
export type BulkTaskAction = z.infer<typeof bulkTaskActionSchema>

export const BULK_MAX_ITEMS = 200

/** Lote: cada item tem a própria ação (o "Desfazer" devolve valores diferentes por tarefa). */
export const bulkTasksSchema = z.object({
    items: z
        .array(
            z.object({
                id: z.union([objectId, z.string().regex(DRAFT_TASK_ID, "Identificador inválido")]),
                code,
                fromStatus: z.enum(TASK_STATUSES).optional(),
                action: bulkTaskActionSchema,
            }),
        )
        .min(1, "Selecione ao menos uma tarefa")
        .max(BULK_MAX_ITEMS, `No máximo ${BULK_MAX_ITEMS} tarefas por vez`),
})
export type BulkTasksInput = z.input<typeof bulkTasksSchema>

export interface BulkTaskResult {
    id: string
    ok: boolean
    error?: string
}
