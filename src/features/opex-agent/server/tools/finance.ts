import { z } from "zod"
import { listFinanceByClient } from "@/features/finance/server/service"
import { defineTool } from "./define"

const ITEMS_PER_GROUP_MAX = 100

/** Financeiro (somente leitura): faturamento das tarefas concluídas e dos serviços, por cliente. */
export const financeTools = [
    defineTool({
        name: "get_finance",
        group: "finance",
        label: "Financeiro",
        risk: "read",
        description:
            "Faturamento por cliente num período: tarefas concluídas (snapshot da estimativa) e serviços, com horas reais, horas do cliente e faturamento (R$), e os totais. Com includeItems, lista também as tarefas/serviços de cada cliente.",
        input: z.object({
            from: z.string().optional().describe("ISO 8601"),
            to: z.string().optional().describe("ISO 8601"),
            clientIds: z.array(z.string()).optional(),
            projectIds: z.array(z.string()).optional(),
            includeArchived: z.boolean().optional().describe("Inclui serviços arquivados na lista (fora dos totais)"),
            includeItems: z.boolean().optional(),
            itemsPerClient: z.number().int().min(1).max(ITEMS_PER_GROUP_MAX).optional().describe("Padrão 30"),
        }),
        execute: async (input) => {
            const result = await listFinanceByClient({
                from: input.from ?? null,
                to: input.to ?? null,
                clientIds: input.clientIds ?? [],
                projectIds: input.projectIds ?? [],
                includeArchived: input.includeArchived ?? false,
            })
            const perClient = input.itemsPerClient ?? 30
            return {
                from: result.from,
                to: result.to,
                totals: result.totals,
                clients: result.groups.map(({ tasks, ...group }) => ({
                    ...group,
                    ...(input.includeItems ? { items: tasks.slice(0, perClient), itemsOmitted: Math.max(0, tasks.length - perClient) } : {}),
                })),
            }
        },
    }),
]
