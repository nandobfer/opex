import { z } from "zod"
import { OPEX_JOB_UNITS, OPEX_JOB_WHEN, type OpexJobDto } from "../../jobs"

/**
 * Entradas e conversões compartilhadas pelas ferramentas de jobs do dono e do portal (módulo puro:
 * não importa os serviços). Fica fora de `tools/jobs.ts` e de `tools/registry.ts` para não formar
 * ciclo com `client-tools/registry` → `client-tools/jobs`: no build de produção o catálogo do portal
 * era avaliado antes de `tools/jobs` terminar e lia estas constantes em TDZ
 * ("Cannot access 'm' before initialization" nas rotas de configuração dos agentes).
 */

export const jobIdField = z
    .string()
    .regex(/^[a-f0-9]{24}$/i, "Id inválido")
    .describe("Id do job (de list_jobs)")

const jobScheduleFields = {
    when: z.enum(OPEX_JOB_WHEN).describe("now = agora; in = daqui a `amount` `unit`; at = em `date` + `time` (Brasília)"),
    amount: z.number().int().min(1).max(9999).optional().describe("Com when=in"),
    unit: z.enum(OPEX_JOB_UNITS).optional().describe("Com when=in"),
    date: z.string().optional().describe("Com when=at: aaaa-mm-dd (Brasília)"),
    time: z.string().optional().describe("Com when=at: hh:mm (Brasília)"),
}

const jobSessionField = z
    .string()
    .optional()
    .describe('Onde o prompt roda: "current" (padrão, esta sessão — continua o contexto), "new" (sessão nova) ou o id de outra sessão')

export const jobScheduleInput = z.object({ title: z.string().describe("Título curto do job"), prompt: z.string().describe("O que fazer no horário"), session: jobSessionField, ...jobScheduleFields })

export const jobUpdateInput = z.object({
    jobId: jobIdField,
    title: z.string().optional(),
    prompt: z.string().optional(),
    session: jobSessionField,
    when: jobScheduleFields.when.optional(),
    amount: jobScheduleFields.amount,
    unit: jobScheduleFields.unit,
    date: jobScheduleFields.date,
    time: jobScheduleFields.time,
})

const short = (value: string) => (value.length > 80 ? `${value.slice(0, 79)}…` : value)

export const summarizeSchedule = (input: z.infer<typeof jobScheduleInput>) => `Agendar o job "${short(input.title)}"`

export function jobView(job: OpexJobDto) {
    return {
        id: job.id,
        title: job.title,
        prompt: job.prompt,
        status: job.status,
        runAt: job.runAt,
        sessionId: job.sessionId,
        resultSessionId: job.resultSessionId,
        createdBy: job.createdBy,
        delayMs: job.delayMs,
        error: job.error,
        finishedAt: job.finishedAt,
    }
}
