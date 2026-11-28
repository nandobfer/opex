/**
 * Agendador interno (Integrações › Crons) da central `@nandobfer/integracoes`, com o runtime do Opex
 * já configurado. A guarda da prévia (`OPEX_PREVIEW`) vem do `isSchedulerDisabled` do runtime.
 */
import "./runtime"

export {
    CronJobRunError,
    FAST_SCHEDULER_TICK_MS,
    JOB_LEASE_MS,
    FAST_JOB_LEASE_MS,
    SCHEDULER_TICK_MS,
    registerBuiltInJobs,
    registerInternalJob,
    rescheduleJobs,
    runFastSchedulerTick,
    runJobNow,
    runSchedulerTick,
    startCronScheduler,
    syncJobState,
    tickReference,
    type ManualRunResult,
    type TickResult,
} from "@nandobfer/integracoes/server"
