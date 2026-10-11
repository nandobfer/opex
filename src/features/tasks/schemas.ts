import { z } from "zod"
import { COLUMN_COLORS, COLUMN_ICON_KEYS, COLUMN_KEY_PATTERN } from "./board"
import { TASK_PRIORITIES, TASK_TYPES } from "./constants"

const columnKey = z.string().regex(COLUMN_KEY_PATTERN, "Coluna inválida")
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Identificador inválido")
const markdown = z.string().optional()

/** Tarefa (criar/editar). Mesmo schema no formulário e na API. */
export const taskInputSchema = z.object({
    title: z.string().trim().min(1, "Informe o título").max(200, "Máximo de 200 caracteres"),
    projectId: objectId,
    columnId: columnKey,
    description: markdown,
    technicalSpec: markdown,
    taskType: z.enum(TASK_TYPES).nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
})
export type TaskInput = z.infer<typeof taskInputSchema>

/**
 * Formulário da tarefa: o mesmo contrato da API **sem a especificação técnica** (ela sai do
 * formulário e será gerada de forma agêntica).
 */
export const taskFormSchema = taskInputSchema.omit({ technicalSpec: true })
export type TaskFormValues = z.infer<typeof taskFormSchema>

export const createTaskSchema = taskInputSchema
export type CreateTaskInput = z.infer<typeof createTaskSchema>

/** Edição parcial: ao menos um campo. */
export const updateTaskSchema = taskInputSchema
    .partial()
    .refine((value) => Object.values(value).some((item) => item !== undefined), "Nada para atualizar")
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>

/** Mover a tarefa de coluna (arrastar / "Mover para…"). */
export const moveTaskSchema = z.object({
    targetColumn: columnKey,
    order: z.number().finite().optional(),
})
export type MoveTaskInput = z.infer<typeof moveTaskSchema>

/**
 * Edita as horas estimadas de uma tarefa do portal (`PATCH /api/tasks/[id]/estimate`). As horas do
 * cliente e o faturamento são recalculados pelo servidor com o fator e o custo/hora do cliente que
 * originou a tarefa.
 */
export const updateTaskEstimateSchema = z.object({
    hours: z.number({ error: "Informe as horas" }).min(0, "Mínimo 0").max(10_000, "Máximo 10000"),
})
export type UpdateTaskEstimateInput = z.infer<typeof updateTaskEstimateSchema>

/**
 * Define, troca ou remove o cliente da tarefa (`PATCH /api/tasks/[id]/client`). `null` remove o
 * cliente e, com ele, a estimativa (o campo de estimativa some da tarefa).
 */
export const setTaskClientSchema = z.object({ clientId: objectId.nullable() })
export type SetTaskClientInput = z.infer<typeof setTaskClientSchema>

/** Coluna (criar/editar). Mesmo schema no formulário e na API. */
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

/** Ação de uma tarefa num lote (`POST /api/tasks/bulk`). */
export const bulkTaskActionSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("move"), column: columnKey, order: z.number().finite().optional() }),
    z.object({ type: z.literal("priority"), priority: z.enum(TASK_PRIORITIES) }),
    z.object({ type: z.literal("archive"), archive: z.boolean() }),
])
export type BulkTaskAction = z.infer<typeof bulkTaskActionSchema>

export const BULK_MAX_ITEMS = 200

/** Lote: cada item tem a própria ação (o "Desfazer" devolve valores diferentes por tarefa). */
export const bulkTasksSchema = z.object({
    items: z
        .array(z.object({ id: objectId, action: bulkTaskActionSchema }))
        .min(1, "Selecione ao menos uma tarefa")
        .max(BULK_MAX_ITEMS, `No máximo ${BULK_MAX_ITEMS} tarefas por vez`),
})
export type BulkTasksInput = z.input<typeof bulkTasksSchema>

export interface BulkTaskResult {
    id: string
    ok: boolean
    error?: string
}
