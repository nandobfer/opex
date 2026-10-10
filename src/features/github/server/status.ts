import { dbConnect } from "@/lib/db"
import { CronJobState } from "@/lib/db/models/CronJobState"
import { Project } from "@/lib/db/models/Project"
import { GITHUB_ISSUE_SYNC_JOB_ID } from "@/lib/integrations/catalog"
import { getIntegrationConfig } from "@/lib/integrations/config"
import type { GithubSyncStatusDto } from "../types"

const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null)

/** Aba Sincronização: estado da rotina e resultado da última leitura de cada vínculo. */
export async function getSyncStatus(): Promise<GithubSyncStatusDto> {
    await dbConnect()
    const [crons, state, projects] = await Promise.all([
        getIntegrationConfig("crons"),
        CronJobState.findOne({ jobId: GITHUB_ISSUE_SYNC_JOB_ID }).lean(),
        Project.find().sort({ repo: 1 }).lean(),
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
        links: projects.map((project) => ({
            id: String(project._id),
            repo: project.repo,
            enabled: project.enabled !== false,
            initialImportAt: iso(project.initialImportAt),
            lastSync: project.lastSync ? { at: new Date(project.lastSync.at).toISOString(), ok: project.lastSync.ok, message: project.lastSync.message } : null,
        })),
    }
}
