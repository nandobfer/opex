import { z } from "zod"
import { TASK_TYPES } from "@/features/tasks/constants"

/**
 * Contratos do controle de horas **agêntico** (o Opex é a fonte de verdade). Os apontamentos são
 * criados/fechados **somente pelo servidor**, a partir da mesa de trabalho; a interação humana é
 * somente leitura. Módulo puro.
 */

export const TIME_UPDATED_EVENT = "time-updated"
export const TIME_PATH = "/tarefas/horas"

/** Id de projeto (repositório vinculado) no MongoDB. */
export const PROJECT_ID_PATTERN = /^[a-f0-9]{24}$/i

const isoDate = z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Data inválida")

/**
 * Consulta dos apontamentos. `from`/`to` são instantes ISO; `projects` e `types` são recortes
 * opcionais (semântica **OU** dentro de cada lista; **E** entre período, repositório e tipo). As
 * listas chegam separadas por vírgula ou repetidas na query string (ver `queryToObject`).
 */
export const timeLogsQuerySchema = z.object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    /** Ids dos projetos (repositórios vinculados); vazio = todos. */
    projects: z.array(z.string().regex(PROJECT_ID_PATTERN, "Projeto inválido")).default([]),
    /** Tipos de tarefa; vazio = todos. */
    types: z.array(z.enum(TASK_TYPES, { error: "Tipo de tarefa inválido" })).default([]),
})
export type TimeLogsQuery = z.infer<typeof timeLogsQuerySchema>
