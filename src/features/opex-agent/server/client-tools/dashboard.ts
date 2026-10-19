import { z } from "zod"
import { buildClientDashboard } from "@/features/orcamentos/server/portal-dashboard"
import { listClientCost } from "@/features/orcamentos/server/portal-finance"
import { getClientServiceDetail } from "@/features/orcamentos/server/portal-services"
import { defineTool, OpexToolError } from "../tools/define"
import { requireClientActor } from "./helpers"

const isoDate = z.string().trim().min(1).refine((value) => !Number.isNaN(new Date(value).getTime()), "Data inválida").describe("Data ISO (ex.: 2026-10-01)")
const DAY_MS = 24 * 60 * 60 * 1000

/** Período do pedido: `from`/`to` informados ou os últimos 30 dias. */
function rangeOf(input: { from?: string; to?: string }): { from: string; to: string } {
    const to = input.to ? new Date(input.to) : new Date()
    const from = input.from ? new Date(input.from) : new Date(to.getTime() - 30 * DAY_MS)
    if (from.getTime() > to.getTime()) throw new OpexToolError("O início do período é depois do fim")
    return { from: from.toISOString(), to: to.toISOString() }
}

export const clientDashboardTools = [
    defineTool({
        name: "get_dashboard",
        group: "dashboard",
        label: "Dashboard",
        risk: "read",
        description:
            "Métricas do cliente no período (padrão: últimos 30 dias): tarefas por coluna, por repositório, por tag, criadas × concluídas e a série do período. O bloco financeiro só vem para administradores.",
        input: z.object({ from: isoDate.optional(), to: isoDate.optional() }),
        execute: async (input, context) => {
            const actor = requireClientActor(context)
            return buildClientDashboard(String(actor.client._id), rangeOf(input), actor.isAdmin)
        },
    }),
]

export const clientFinanceTools = [
    defineTool({
        name: "get_finance",
        group: "finance",
        label: "Financeiro",
        risk: "read",
        adminOnly: true,
        description: "Faturamento do cliente no período (padrão: últimos 30 dias) por repositório: horas infladas, custo em reais, tarefas concluídas e serviços.",
        input: z.object({ from: isoDate.optional(), to: isoDate.optional(), projectIds: z.array(z.string()).optional() }),
        execute: async (input, context) => {
            const actor = requireClientActor(context)
            const range = rangeOf(input)
            return listClientCost(String(actor.client._id), { from: range.from, to: range.to, projectIds: input.projectIds })
        },
    }),
    defineTool({
        name: "get_service",
        group: "finance",
        label: "Ler serviço",
        risk: "read",
        adminOnly: true,
        description: "Detalhe de um serviço faturado do cliente: descrição, data, horas infladas, valor e anexos.",
        input: z.object({ serviceId: z.string().trim().min(1).max(40) }),
        execute: async ({ serviceId }, context) => {
            const actor = requireClientActor(context)
            return getClientServiceDetail(String(actor.client._id), serviceId)
        },
    }),
]
