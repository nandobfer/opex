import { dbConnect } from "@/lib/db"
import { CronJobState } from "@nandobfer/integracoes/mongoose"
import { AGENTIC_PR_WATCH_JOB_ID } from "@/features/integrations/registry/jobs"
import { getIntegrationConfig } from "@/lib/integrations/runtime"
import type { PrWatchScheduleDto } from "../types"

/**
 * Agendamento da rotina `agentic-pr-watch` (Integrações › Crons): se está ligada, quando roda de
 * novo (o `nextRunAt` já avança na reivindicação, então durante a execução é a próxima rodada) e se
 * está executando agora (lease vigente).
 */
export async function loadPrWatchSchedule(now: Date = new Date()): Promise<PrWatchScheduleDto> {
    const config = await getIntegrationConfig("crons")
    const job = config.jobs.find((candidate) => candidate.id === AGENTIC_PR_WATCH_JOB_ID)
    const enabled = Boolean(config.schedulerEnabled && job?.enabled)
    await dbConnect()
    const state = await CronJobState.findOne({ jobId: AGENTIC_PR_WATCH_JOB_ID }).select({ nextRunAt: 1, lockedUntil: 1 }).lean()
    return {
        enabled,
        nextCheckAt: enabled && state?.nextRunAt ? new Date(state.nextRunAt).toISOString() : null,
        running: Boolean(state?.lockedUntil && new Date(state.lockedUntil).getTime() > now.getTime()),
    }
}
