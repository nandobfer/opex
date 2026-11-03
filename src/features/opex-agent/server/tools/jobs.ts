import { z } from "zod"
import { OPEX_JOB_FILTERS, OPEX_JOB_ORIGIN_FILTERS, jobToInput, opexJobInputSchema } from "../../jobs"
import { cancelOpexJob, createOpexJob, getOpexJob, listOpexJobs, updateOpexJob } from "../jobs"
import { OWNER_SCOPE, type OpexServerScope } from "../scope"
import { defineTool, type OpexToolContext } from "./define"
import { jobIdField, jobScheduleInput, jobUpdateInput, jobView, summarizeSchedule } from "./job-shared"

/**
 * Ferramentas de jobs do dono. As entradas e conversões compartilhadas com o portal ficam em
 * `job-shared.ts`; as funções de serviço recebem o escopo, que decide quais jobs e sessões o ator
 * enxerga.
 */

function sessionIdFor(session: string | undefined, currentSessionId: string): string | null {
    if (!session || session === "current") return currentSessionId
    if (session === "new") return null
    return session
}

/** Agenda pelo escopo informado (ferramenta do dono ou do portal). */
export async function scheduleJobTool(input: z.infer<typeof jobScheduleInput>, context: OpexToolContext, scope: OpexServerScope, actorId: string) {
    const parsed = opexJobInputSchema.parse({
        title: input.title,
        prompt: input.prompt,
        sessionId: sessionIdFor(input.session, context.sessionId),
        when: input.when,
        amount: input.amount ?? null,
        unit: input.unit ?? null,
        date: input.date ?? null,
        time: input.time ?? null,
    })
    return createOpexJob(parsed, { actorId, createdBy: "agent", originSessionId: context.sessionId }, scope)
}

/** Edita pelo escopo: campos omitidos ficam como estão. */
export async function updateJobTool(input: z.infer<typeof jobUpdateInput>, context: OpexToolContext, scope: OpexServerScope, actorId: string) {
    const current = jobToInput(await getOpexJob(input.jobId, scope), "edit")
    const schedule = input.when ? { when: input.when, amount: input.amount ?? null, unit: input.unit ?? null, date: input.date ?? null, time: input.time ?? null } : {}
    const parsed = opexJobInputSchema.parse({
        ...current,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
        ...(input.session !== undefined ? { sessionId: sessionIdFor(input.session, context.sessionId) } : {}),
        ...schedule,
    })
    return updateOpexJob(input.jobId, parsed, actorId, scope)
}

/** Prompts agendados para o próprio agente (aba Jobs de Integrações › Crons). */
export const jobTools = [
    defineTool({
        name: "list_jobs",
        group: "jobs",
        label: "Listar jobs",
        risk: "read",
        description:
            "Jobs agendados (prompts que o agente executa sozinho) e o histórico dos últimos 30 dias: status, horário previsto, sessão, atraso e erro. Inclui os jobs dos usuários do portal (origin=client).",
        input: z.object({
            filter: z.enum(OPEX_JOB_FILTERS).optional().describe("scheduled = na fila; finished = histórico; all (padrão)"),
            origin: z.enum(OPEX_JOB_ORIGIN_FILTERS).optional().describe("owner = os do dono; client = os do portal; all (padrão)"),
        }),
        async execute(input) {
            const items = (await listOpexJobs({ filter: input.filter ?? "all", origin: input.origin ?? "all" }, OWNER_SCOPE)).map((job) => ({ ...jobView(job), origin: job.origin }))
            return { items, total: items.length }
        },
    }),
    defineTool({
        name: "schedule_job",
        group: "jobs",
        label: "Agendar job",
        risk: "write",
        description:
            "Agenda um prompt para você mesmo executar uma vez: agora, daqui a um tempo ou numa data e hora de Brasília (a hora atual está no contexto do turno). No horário, o prompt chega como mensagem na sessão escolhida e você executa sozinho; o usuário recebe um aviso ao terminar. Escreva o prompt completo, com o que fazer e o que relatar.",
        input: jobScheduleInput,
        summarize: summarizeSchedule,
        async execute(input, context) {
            return { ok: true, ...jobView(await scheduleJobTool(input, context, OWNER_SCOPE, context.actorId)) }
        },
    }),
    defineTool({
        name: "update_job",
        group: "jobs",
        label: "Editar job",
        risk: "write",
        description: "Edita um job ainda agendado do dono (título, prompt, sessão ou horário). Campos omitidos ficam como estão; mudar o horário exige `when` e os campos dele. Jobs do portal não podem ser editados pelo dono.",
        input: jobUpdateInput,
        summarize: (input) => `Editar o job ${input.jobId}`,
        async execute(input, context) {
            return { ok: true, ...jobView(await updateJobTool(input, context, OWNER_SCOPE, context.actorId)) }
        },
    }),
    defineTool({
        name: "cancel_job",
        group: "jobs",
        label: "Cancelar job",
        risk: "destructive",
        description: "Cancela um job agendado, do dono ou do portal (ele fica no histórico como cancelado).",
        input: z.object({ jobId: jobIdField }),
        summarize: (input) => `Cancelar o job ${input.jobId}`,
        async execute(input, context) {
            return { ok: true, ...jobView(await cancelOpexJob(input.jobId, context.actorId, OWNER_SCOPE)) }
        },
    }),
]
