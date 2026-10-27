import { z } from "zod"
import { OPEX_JOB_FILTERS } from "../../jobs"
import { cancelOpexJob, listOpexJobs } from "../jobs"
import { clientOpexScope } from "../scope"
import { defineTool } from "../tools/define"
import { jobIdField, jobScheduleInput, jobUpdateInput, jobView, scheduleJobTool, summarizeSchedule, updateJobTool } from "../tools/jobs"
import { requireClientActor } from "./helpers"

/**
 * Jobs no portal: o usuário agenda prompts para o agente executar sozinho mais tarde, sempre no
 * próprio escopo (cliente + usuário). Grupo "desligado por padrão": só existe quando o dono o liga.
 */
export const clientJobTools = [
    defineTool({
        name: "list_jobs",
        group: "jobs",
        label: "Listar jobs",
        risk: "read",
        description: "Jobs do usuário (prompts que o agente executa sozinho) agendados e o histórico dos últimos 30 dias: status, horário previsto, sessão, atraso e erro.",
        input: z.object({ filter: z.enum(OPEX_JOB_FILTERS).optional().describe("scheduled = na fila; finished = histórico; all (padrão)") }),
        async execute(input, context) {
            const scope = clientOpexScope(requireClientActor(context))
            const items = (await listOpexJobs({ filter: input.filter ?? "all" }, scope)).map(jobView)
            return { items, total: items.length }
        },
    }),
    defineTool({
        name: "schedule_job",
        group: "jobs",
        label: "Agendar job",
        risk: "write",
        description:
            "Agenda um prompt para você mesmo executar uma vez: agora, daqui a um tempo ou numa data e hora de Brasília (a hora atual está no contexto do turno). No horário, o prompt chega como mensagem na sessão escolhida e você executa sozinho, com as mesmas ferramentas e limites do usuário; ele recebe um aviso ao terminar.",
        input: jobScheduleInput,
        summarize: summarizeSchedule,
        async execute(input, context) {
            const actor = requireClientActor(context)
            return { ok: true, ...jobView(await scheduleJobTool(input, context, clientOpexScope(actor), actor.userId)) }
        },
    }),
    defineTool({
        name: "update_job",
        group: "jobs",
        label: "Editar job",
        risk: "write",
        description: "Edita um job ainda agendado do usuário (título, prompt, sessão ou horário). Campos omitidos ficam como estão; mudar o horário exige `when` e os campos dele.",
        input: jobUpdateInput,
        summarize: (input) => `Editar o job ${input.jobId}`,
        async execute(input, context) {
            const actor = requireClientActor(context)
            return { ok: true, ...jobView(await updateJobTool(input, context, clientOpexScope(actor), actor.userId)) }
        },
    }),
    defineTool({
        name: "cancel_job",
        group: "jobs",
        label: "Cancelar job",
        risk: "destructive",
        description: "Cancela um job agendado do usuário (ele fica no histórico como cancelado). Sempre pede confirmação.",
        input: z.object({ jobId: jobIdField }),
        summarize: (input) => `Cancelar o job ${input.jobId}`,
        async execute(input, context) {
            const actor = requireClientActor(context)
            return { ok: true, ...jobView(await cancelOpexJob(input.jobId, actor.userId, clientOpexScope(actor))) }
        },
    }),
]
