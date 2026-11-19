import { dbConnect } from "@/lib/db"
import { pluginLog } from "./logs"
import { CronJobState } from "@/lib/db/models/CronJobState"
import { INSTANCE_ID } from "@/lib/instance"
import { nextRunAt, scheduleSignature } from "@/lib/integrations/schedule"
import { loggerFor } from "@/lib/logger"
import { pluginCronJobId } from "../constants"
import { pluginRegistries } from "./kernel/registries"

/**
 * Crons dos plugins do dono (OPE-172), rodados pelo tick de minuto do agendador interno
 * (`runSchedulerTick`, que já não roda em instância de prévia). Cada cron tem lease próprio em
 * `CronJobState` (`plugin:{id}:{nome}`): no máximo uma execução entre instâncias. Só os crons da
 * fiber `stable` agendam; os da prévia ficam registrados sem rodar.
 */

const LEASE_MS = 15 * 60_000
/**
 * Teto de uma execução, abaixo do lease: um cron que nunca resolve (fetch sem timeout) é encerrado como
 * erro, libera o próprio lease e não trava os crons seguintes do tick nem roda em paralelo com a
 * próxima reivindicação.
 */
export const PLUGIN_CRON_TIMEOUT_MS = 10 * 60_000

function runWithTimeout(run: () => Promise<void> | void, ms: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Tempo esgotado: o cron passou de ${Math.round(ms / 60_000)} min`)), ms)
    })
    return Promise.race([Promise.resolve().then(run), timeout]).finally(() => clearTimeout(timer))
}
const log = () => loggerFor({ module: "plugins.crons" })

export async function runPluginCrons(now: Date = new Date()): Promise<string[]> {
    const entries = pluginRegistries().crons.list().filter((entry) => entry.value.scheduled)
    if (!entries.length) return []
    await dbConnect()
    const executed: string[] = []
    for (const entry of entries) {
        const jobId = pluginCronJobId(entry.owner.pluginId, entry.value.name)
        const signature = scheduleSignature(entry.value.schedule)
        try {
            await CronJobState.updateOne({ jobId }, { $setOnInsert: { scheduleSignature: signature, nextRunAt: nextRunAt(entry.value.schedule, now) } }, { upsert: true })
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) throw error
        }
        await CronJobState.updateOne({ jobId, scheduleSignature: { $ne: signature } }, { $set: { scheduleSignature: signature, nextRunAt: nextRunAt(entry.value.schedule, now) } })
        const leaseUntil = new Date(now.getTime() + LEASE_MS)
        const claimed = await CronJobState.findOneAndUpdate(
            { jobId, nextRunAt: { $lte: now }, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] },
            { $set: { lockedUntil: leaseUntil, lockedBy: INSTANCE_ID, lastRunAt: now, nextRunAt: nextRunAt(entry.value.schedule, now) } },
            { new: true },
        )
        if (!claimed) continue
        const startedAt = Date.now()
        let status: "ok" | "error" = "ok"
        let message: string | null = null
        try {
            await runWithTimeout(async () => { await entry.value.run() }, PLUGIN_CRON_TIMEOUT_MS)
            executed.push(jobId)
            pluginLog(entry.owner.pluginId, "step", `Cron "${entry.value.name}" executado`, { duracaoMs: Date.now() - startedAt }, entry.owner.channel)
        } catch (error) {
            status = "error"
            message = error instanceof Error ? error.message : String(error)
            log().error({ err: error, jobId }, "[plugins] Cron de plugin falhou")
            pluginLog(entry.owner.pluginId, "error", `Cron "${entry.value.name}" falhou`, { error: message }, entry.owner.channel)
        }
        // Só libera o lease desta execução (o mesmo `lockedUntil`), nunca o de uma reivindicação posterior.
        await CronJobState.updateOne(
            { jobId, lockedBy: INSTANCE_ID, lockedUntil: leaseUntil },
            { $set: { lockedUntil: null, lockedBy: null, lastFinishedAt: new Date(), lastStatus: status, lastError: message?.slice(0, 1000) ?? null, lastDurationMs: Date.now() - startedAt } },
        )
    }
    return executed
}
