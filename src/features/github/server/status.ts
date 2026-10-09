import { dbConnect } from "@/lib/db"
import { CronJobState } from "@/lib/db/models/CronJobState"
import { GithubRepoLink } from "@/lib/db/models/Github"
import { GITHUB_ISSUE_SYNC_JOB_ID } from "@/lib/integrations/catalog"
import { getIntegrationConfig } from "@/lib/integrations/config"
import type { GithubSyncStatusDto } from "../types"

const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null)

/** Aba Sincronização: estado da rotina e resultado da última leitura de cada vínculo. */
export async function getSyncStatus(): Promise<GithubSyncStatusDto> {
    await dbConnect()
    const [crons, state, links] = await Promise.all([
        getIntegrationConfig("crons"),
        CronJobState.findOne({ jobId: GITHUB_ISSUE_SYNC_JOB_ID }).lean(),
        GithubRepoLink.find().sort({ repo: 1 }).lean(),
    ])
    const job = crons.jobs.find((item) => item.id === GITHUB_ISSUE_SYNC_JOB_ID)
    return {
        job: job
            ? {
                  enabled: job.enabled && crons.schedulerEnabled,
                  lastRunAt: iso(state?.lastRunAt),
                  lastFinishedAt: iso(state?.lastFinishedAt),
                  lastStatus: (state?.lastStatus as "ok" | "error" | null | undefined) ?? null,
                  lastError: state?.lastError ?? null,
                  nextRunAt: iso(state?.nextRunAt),
              }
            : null,
        links: links.map((link) => ({
            id: String(link._id),
            repo: link.repo,
            enabled: link.enabled !== false,
            initialImportAt: iso(link.initialImportAt),
            lastSync: link.lastSync ? { at: new Date(link.lastSync.at).toISOString(), ok: link.lastSync.ok, message: link.lastSync.message } : null,
        })),
    }
}
