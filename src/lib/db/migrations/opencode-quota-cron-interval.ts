import { Counter } from "@/lib/db/models/Counter"
import { Integration } from "@/lib/db/models/Integration"
import { OPENCODE_QUOTA_JOB_ID, type CronJobConfig } from "@/lib/integrations/catalog"
import { logger } from "@/lib/logger"

/**
 * OPE-93: a quota do OpenCode passou a vir do RPC do plugin e a rotina `opencode-quota-refresh`
 * passou de 5 para 1 min. A rotina já salva mantém a configuração do usuário (`withBuiltInJobs`),
 * então só quem ainda está no padrão antigo (intervalo de 5 min) vai para 1 min; um valor escolhido
 * pelo usuário não é tocado. Roda uma vez só (marcador em `counters`), para não desfazer um 5 min
 * escolhido depois.
 */

const MARKER_KEY = "migration:opencode-quota-cron-1min"

/** Rotinas com a da quota no padrão antigo trocada para 1 min; `null` quando não há o que mudar. */
export function quotaJobsToOneMinute(jobs: CronJobConfig[]): CronJobConfig[] | null {
    let changed = false
    const next = jobs.map((job) => {
        if (job.id !== OPENCODE_QUOTA_JOB_ID || job.schedule.type !== "interval" || job.schedule.minutes !== 5) return job
        changed = true
        return { ...job, schedule: { ...job.schedule, minutes: 1 } }
    })
    return changed ? next : null
}

export async function migrateOpencodeQuotaCronInterval(): Promise<void> {
    const marker = await Counter.updateOne({ key: MARKER_KEY }, { $setOnInsert: { seq: 1 } }, { upsert: true })
    if (!marker.upsertedCount) return
    const config = (await Integration.findOne({ integrationId: "crons" }).lean()) as { publicValues?: { jobs?: CronJobConfig[] } } | null
    const jobs = config?.publicValues?.jobs
    if (!Array.isArray(jobs)) return
    const next = quotaJobsToOneMinute(jobs)
    if (!next) return
    await Integration.updateOne({ integrationId: "crons" }, { $set: { "publicValues.jobs": next } })
    logger.warn("[migration] rotina da quota do OpenCode passou de 5 para 1 min")
}
