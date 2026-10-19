import { z } from "zod"
import { TASK_TYPES } from "@/features/tasks/constants"
import { timeLogsQuerySchema } from "@/features/time/schemas"
import { listActiveTimers, listTimeLogs } from "@/features/time/server/service"
import { defineTool } from "./define"

const isoDate = z.string().describe("Data/hora ISO 8601 com fuso (ex.: 2026-10-19T14:30:00-03:00)")

/** Horas agênticas: o Opex só lê (os períodos abrem e fecham com as mesas de trabalho). */
export const timeTools = [
    defineTool({
        name: "list_active_periods",
        group: "time",
        label: "Períodos ativos",
        risk: "read",
        description: "Períodos de trabalho agêntico abertos agora (uma mesa trabalhando numa tarefa), com tarefa, etapa, agente e modelo.",
        input: z.object({}),
        execute: async () => listActiveTimers(),
    }),
    defineTool({
        name: "list_time_logs",
        group: "time",
        label: "Horas agênticas",
        risk: "read",
        description: "Horas agênticas apontadas num período (paginado, mais recentes primeiro), com totais do conjunto filtrado. Filtros por projeto e tipo de tarefa.",
        input: z.object({
            from: isoDate.optional(),
            to: isoDate.optional(),
            page: z.number().int().min(1).optional(),
            projectIds: z.array(z.string()).optional(),
            types: z.array(z.enum(TASK_TYPES)).optional(),
        }),
        execute: async (input) => listTimeLogs(timeLogsQuerySchema.parse({ from: input.from, to: input.to, page: input.page ?? 1, projects: input.projectIds ?? [], types: input.types ?? [] })),
    }),
]
