import { z } from "zod"
import { SERVICE_CALC_ORIGINS, SERVICE_CALC_ORIGIN_LABELS } from "@/features/services/constants"
import { serviceWriteSchema, type ServiceWriteInput } from "@/features/services/schemas"
import { createService, getService, listServiceAggregates, requestServiceAi, setServiceArchived, updateService } from "@/features/services/server/service"
import type { ServiceDto } from "@/features/services/types"
import { defineTool, OpexToolError } from "./define"
import { clipText, isObjectId, resolveTask } from "./helpers"

const serviceRef = z.string().trim().min(1).max(60).describe("Código do serviço (ex.: SRV-12) ou id")
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use AAAA-MM-DD").describe("Data do serviço (AAAA-MM-DD)")
const amountFields = {
    origin: z.enum(SERVICE_CALC_ORIGINS).describe(`Campo informado: ${SERVICE_CALC_ORIGINS.map((origin) => `${origin} (${SERVICE_CALC_ORIGIN_LABELS[origin]})`).join(", ")}; os outros dois são calculados com o fator e o custo/hora do cliente`),
    amount: z.number().min(0).describe("Valor do campo `origin`: horas decimais (hours/clientHours) ou reais (billingBrl)"),
}

/** Aceita id ou código (SRV-12), inclusive arquivados. */
async function resolveService(ref: string): Promise<string> {
    const value = ref.trim()
    if (isObjectId(value)) return value
    const rows = await listServiceAggregates({ includeArchived: true })
    const found = rows.find((row) => row.code.toLowerCase() === value.toLowerCase())
    if (!found) throw new OpexToolError(`Serviço "${value}" não encontrado. Use list_services para achar o código certo.`)
    return found.id
}

async function taskIdOf(ref: string | null | undefined): Promise<string | null | undefined> {
    if (ref === undefined || ref === null) return ref
    return (await resolveTask(ref)).id
}

function amounts(origin: (typeof SERVICE_CALC_ORIGINS)[number], amount: number) {
    return { origin, hours: origin === "hours" ? amount : 0, clientHours: origin === "clientHours" ? amount : 0, billingBrl: origin === "billingBrl" ? amount : 0 }
}

function slimService(service: ServiceDto) {
    return {
        ...service,
        description: clipText(service.description, 8000),
        serviceDate: service.serviceDate.slice(0, 10),
    }
}

export const serviceTools = [
    defineTool({
        name: "list_services",
        group: "services",
        label: "Listar serviços",
        risk: "read",
        description: "Serviços (lançamentos manuais de faturamento) num período, com cliente, repositório, horas e faturamento. Arquivados só com includeArchived.",
        input: z.object({
            from: z.string().optional().describe("ISO 8601 (início do período, pela data do serviço)"),
            to: z.string().optional().describe("ISO 8601 (fim do período)"),
            clientIds: z.array(z.string()).optional(),
            projectIds: z.array(z.string()).optional(),
            includeArchived: z.boolean().optional(),
            limit: z.number().int().min(1).max(200).optional().describe("Padrão 50"),
        }),
        execute: async (input) => {
            const rows = await listServiceAggregates({ from: input.from ?? null, to: input.to ?? null, clientIds: input.clientIds ?? [], projectIds: input.projectIds ?? [], includeArchived: input.includeArchived ?? false })
            const limit = input.limit ?? 50
            return {
                total: rows.length,
                returned: Math.min(limit, rows.length),
                services: rows.slice(0, limit).map((row) => ({ ...row, project: row.project?.name ?? null, serviceDate: new Date(row.serviceDate).toISOString().slice(0, 10) })),
            }
        },
    }),
    defineTool({
        name: "get_service",
        group: "services",
        label: "Ler serviço",
        risk: "read",
        description: "Detalhes de um serviço: cliente, repositório, tarefa de referência, descrição, título/resumo/tags da IA, valores e snapshot do fator e do custo/hora.",
        input: z.object({ service: serviceRef }),
        execute: async ({ service }) => slimService(await getService(await resolveService(service))),
    }),
    defineTool({
        name: "create_service",
        group: "services",
        label: "Criar serviço",
        risk: "write",
        description: "Lança um serviço para um cliente (de list_clients). Título, resumo e tags são gerados pela IA em segundo plano quando não informados.",
        input: z.object({
            clientId: z.string(),
            projectId: z.string().nullable().optional(),
            task: z.string().nullable().optional().describe("Tarefa de referência (código ou id), opcional"),
            description: z.string(),
            serviceDate: dateOnly,
            ...amountFields,
            title: z.string().nullable().optional(),
            summary: z.string().nullable().optional(),
        }),
        summarize: (input) => `Lançar um serviço de ${input.amount} (${SERVICE_CALC_ORIGIN_LABELS[input.origin]}) em ${input.serviceDate}`,
        execute: async ({ task, origin, amount, ...input }, context) => {
            const parsed = serviceWriteSchema.parse({ ...input, taskId: await taskIdOf(task), ...amounts(origin, amount) })
            return slimService(await createService(parsed, context.actorId))
        },
    }),
    defineTool({
        name: "update_service",
        group: "services",
        label: "Editar serviço",
        risk: "write",
        description: "Edita um serviço. Envie só o que muda; para alterar valores informe origin + amount (os outros valores são recalculados). Mudar a descrição regenera a IA.",
        input: z.object({
            service: serviceRef,
            clientId: z.string().optional(),
            projectId: z.string().nullable().optional(),
            task: z.string().nullable().optional(),
            description: z.string().optional(),
            serviceDate: dateOnly.optional(),
            origin: amountFields.origin.optional(),
            amount: amountFields.amount.optional(),
            title: z.string().nullable().optional(),
            summary: z.string().nullable().optional(),
        }),
        summarize: (input) => `Editar o serviço ${input.service}`,
        execute: async ({ service, task, origin, amount, ...patch }, context) => {
            const id = await resolveService(service)
            const current = await getService(id)
            if ((origin === undefined) !== (amount === undefined)) throw new OpexToolError("Para alterar valores, informe origin e amount juntos")
            const base: ServiceWriteInput = {
                clientId: current.clientId,
                projectId: current.project?.id ?? null,
                taskId: current.task?.id ?? null,
                description: current.description,
                serviceDate: current.serviceDate.slice(0, 10),
                origin: "hours",
                hours: current.hours,
                clientHours: current.clientHours,
                billingBrl: current.billingBrl,
                title: current.title,
                summary: current.summary,
            }
            const taskId = await taskIdOf(task)
            const parsed = serviceWriteSchema.parse({
                ...base,
                ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
                ...(taskId !== undefined ? { taskId } : {}),
                ...(origin !== undefined && amount !== undefined ? amounts(origin, amount) : {}),
            })
            return slimService(await updateService(id, parsed, context.actorId))
        },
    }),
    defineTool({
        name: "set_service_archived",
        group: "services",
        label: "Arquivar serviço",
        risk: "destructive",
        description: "Arquiva (some das somas, listas, dashboard e portal) ou restaura um serviço.",
        input: z.object({ service: serviceRef, archived: z.boolean() }),
        summarize: (input) => `${input.archived ? "Arquivar" : "Restaurar"} o serviço ${input.service}`,
        execute: async ({ service, archived }, context) => slimService(await setServiceArchived(await resolveService(service), archived, context.actorId)),
    }),
    defineTool({
        name: "regenerate_service_ai",
        group: "services",
        label: "Regerar IA do serviço",
        risk: "write",
        description: "Gera de novo, em segundo plano, o título, o resumo e as tags do serviço.",
        input: z.object({ service: serviceRef }),
        summarize: (input) => `Gerar de novo o título, o resumo e as tags do serviço ${input.service}`,
        execute: async ({ service }) => {
            await requestServiceAi(await resolveService(service))
            return { ok: true, note: "A geração roda em segundo plano; use get_service para ver o resultado." }
        },
    }),
]
