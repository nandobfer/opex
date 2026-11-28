import { jobRetentionDays } from "@nandobfer/integracoes"
import type { InternalJobRunner } from "@nandobfer/integracoes/server"
import { cronsServer } from "@nandobfer/integracoes/crons/server"
import {
    AGENTIC_PR_WATCH_JOB_ID,
    AGENTIC_QUEUE_JOB_ID,
    AGENT_USAGE_DAILY_JOB_ID,
    ATTACHMENT_CLEANUP_JOB_ID,
    BUILDER_MACHINE_CLEANUP_JOB_ID,
    ENGRAMIND_PENDING_WRITES_JOB_ID,
    ENVIRONMENTS_REGISTRY_CLEANUP_JOB_ID,
    GITHUB_ISSUE_SYNC_JOB_ID,
    HOST_METRICS_JOB_ID,
    MADDOX_AGENT_SESSIONS_CLEANUP_JOB_ID,
    OPENCODE_QUOTA_JOB_ID,
    OPENCODE_SESSIONS_CLEANUP_JOB_ID,
    OPEX_AGENT_SESSIONS_CLEANUP_JOB_ID,
    OPEX_FILES_CLEANUP_JOB_ID,
    TASK_SUMMARY_JOB_ID,
    TASK_TAGS_CONCLUDED_JOB_ID,
    TASK_TAGS_JOB_ID,
} from "../registry/jobs"

/**
 * Executores das rotinas internas do Opex (declaradas em `registry/jobs.ts`). Import dinâmico: o
 * código de cada feature só carrega quando a rotina roda. A verificação de status e as rotinas de IA
 * são da biblioteca.
 */
const OPEX_JOB_RUNNERS: Record<string, InternalJobRunner> = {
    [GITHUB_ISSUE_SYNC_JOB_ID]: async () => (await import("@/features/github/server/sync")).syncGithubIssues(),
    [AGENTIC_PR_WATCH_JOB_ID]: async () => {
        const { watchPullRequests } = await import("@/features/agentic/server/pr-watch")
        const { scanPullRequestsForReview } = await import("@/features/pr-review/server/queue")
        const { pumpPrReviews } = await import("@/features/pr-review/server/service")
        // Agente Revisor: enfileira antes de acompanhar as mesas (o merge automático espera a revisão do commit atual).
        const review = await scanPullRequestsForReview().catch((error: unknown) => `Agente Revisor com falha: ${error instanceof Error ? error.message : String(error)}`)
        const summary = await watchPullRequests()
        const started = await pumpPrReviews().catch(() => 0)
        return `${summary}. ${review}${started ? `; ${started} iniciada(s)` : ""}`
    },
    [AGENTIC_QUEUE_JOB_ID]: async () => {
        const { pumpAllCentralQueues } = await import("@/features/agentic/server/queue")
        const { pumpBuildQueue } = await import("@/features/agentic/server/build-queue")
        const { processPendingSessionDeletions } = await import("@/features/agentic/server/session-cleanup")
        const { processPendingRefinementSessionDeletions } = await import("@/features/refinement/server/session-cleanup")
        const summary = await pumpAllCentralQueues()
        // A fila global do build também é avaliada aqui (reinício, vaga liberada fora do processo).
        await pumpBuildQueue()
        // Sessões de mesas concluídas ainda pendentes de exclusão no OpenCode (independe da fila).
        const deleted = await processPendingSessionDeletions()
        // Sessões de refinamentos concluídos ainda pendentes de exclusão no OpenCode.
        const refinementDeleted = await processPendingRefinementSessionDeletions()
        const { processPendingReviewSessionDeletions } = await import("@/features/pr-review/server/session-cleanup")
        const totalDeleted = deleted + refinementDeleted + (await processPendingReviewSessionDeletions())
        return totalDeleted ? `${summary}; ${totalDeleted} sessão(ões) do OpenCode excluída(s)` : summary
    },
    [TASK_SUMMARY_JOB_ID]: async () => (await import("@/features/ai/server/task-summary")).runTaskSummaryBackfill(),
    [TASK_TAGS_JOB_ID]: async () => (await import("@/features/ai/server/task-tags")).runTaskTagsBackfill(),
    [TASK_TAGS_CONCLUDED_JOB_ID]: async (job) => (await import("@/features/ai/server/task-tags")).runTaskTagsConcludedBackfill(job.scope ?? "pending"),
    [ATTACHMENT_CLEANUP_JOB_ID]: async () => (await import("@/features/tasks/attachments/server/service")).cleanupAbandonedAttachments(),
    [OPEX_FILES_CLEANUP_JOB_ID]: async () => (await import("@/features/opex-agent/server/files")).cleanupPendingOpexFiles(),
    [AGENT_USAGE_DAILY_JOB_ID]: async () => (await import("@/features/agent-metrics/server/usage-daily")).runAgentMetricsRoutine(),
    [ENVIRONMENTS_REGISTRY_CLEANUP_JOB_ID]: async () => (await import("@/features/environments/server/registry")).runRegistryCleanup(),
    [OPENCODE_QUOTA_JOB_ID]: async () => (await import("@/features/opencode-quota/server/service")).runOpencodeQuotaRefresh(),
    [HOST_METRICS_JOB_ID]: async () => (await import("@/features/host-metrics/server/service")).runHostMetricsRefresh(),
    [ENGRAMIND_PENDING_WRITES_JOB_ID]: async () => {
        const result = await (await import("@/features/engramind/server/pending-writes")).flushPendingWrites()
        return `${result.done} gravada(s), ${result.failed} descartada(s), ${result.remaining} pendente(s)`
    },
    // Builder Machine (só faz algo com a integração ativa) — ver aicontext/modules/builder-machine.md.
    [BUILDER_MACHINE_CLEANUP_JOB_ID]: async () => (await import("@/features/local-docker/server/cleanup")).runBuilderMachineCleanup(),
    // Limpezas de sessões sem interação há X dias (`retentionDays` da rotina) — ver aicontext/modules/integrations.md.
    [OPENCODE_SESSIONS_CLEANUP_JOB_ID]: async (job) => {
        const { cleanupIdleOpencodeSessions, describeOpencodeSessionCleanup } = await import("@/features/opencode-service/server/session-retention")
        return describeOpencodeSessionCleanup(await cleanupIdleOpencodeSessions(jobRetentionDays(job)))
    },
    [OPEX_AGENT_SESSIONS_CLEANUP_JOB_ID]: async (job) => {
        const { cleanupIdleAgentSessions, describeAgentSessionCleanup } = await import("@/features/opex-agent/server/session-retention")
        return describeAgentSessionCleanup(await cleanupIdleAgentSessions("opex", jobRetentionDays(job)))
    },
    [MADDOX_AGENT_SESSIONS_CLEANUP_JOB_ID]: async (job) => {
        const { cleanupIdleAgentSessions, describeAgentSessionCleanup } = await import("@/features/opex-agent/server/session-retention")
        return describeAgentSessionCleanup(await cleanupIdleAgentSessions("maddox", jobRetentionDays(job)))
    },
}

export const cronsAdapter = cronsServer({ routesLabel: "/api/routines/*", jobs: OPEX_JOB_RUNNERS })

/** Ganchos do Opex a cada tick de minuto do agendador, depois das rotinas (falha de um não interrompe os demais). */
export const OPEX_SCHEDULER_TICK_HOOKS = [
    // Agente Opex: jobs (prompts agendados) vencidos — ver aicontext/modules/opex-agent.md.
    { failureMessage: "[scheduler] Falha nos jobs do Agente Opex", run: async (now: Date) => (await import("@/features/opex-agent/server/jobs")).runDueOpexJobs(now) },
    // Agente Opex: observações de evento vencidas e entregas pendentes (OPE-194) — só lê as observações.
    { failureMessage: "[scheduler] Falha nas observações do Agente Opex", run: async (now: Date) => (await import("@/features/opex-agent/server/watches")).runDueOpexWatches(now) },
    // Builder Machine: confere/reabre o túnel do PC (só com a integração ativa). Ver aicontext/modules/builder-machine.md.
    { failureMessage: "[scheduler] Falha ao conferir o túnel da Builder Machine", run: async (now: Date) => (await import("@/features/local-docker/server/health")).runLocalDockerHealth(now) },
    // Ambientes: retoma deploys interrompidos e reabre os repasses das portas no PC quando o túnel volta. Ver aicontext/modules/environments.md.
    { failureMessage: "[scheduler] Falha no tick dos ambientes", run: async () => (await import("@/features/environments/server/forwards")).runEnvironmentsTick() },
    // Agentes rotineiros: disparos agendados, retomadas das hibernadas, fila e limites. Ver aicontext/modules/routine-agents.md.
    { failureMessage: "[scheduler] Falha no tick dos agentes rotineiros", run: async (now: Date) => (await import("@/features/routine-agents/server/tick")).runDueRoutineAgents(now) },
    // Bootstrap de projeto (OPE-215): retoma os bootstraps "executando" sem batimento (o app reiniciou). Ver aicontext/modules/project-bootstrap.md.
    { failureMessage: "[scheduler] Falha ao retomar os bootstraps de projeto", run: async (now: Date) => (await import("@/features/project-bootstrap/server/runner")).resumeStaleProjectBootstraps(now) },
    // Plugins do dono (OPE-172): o kernel desta instância acompanha o banco (mudanças feitas por outra instância).
    { failureMessage: "[scheduler] Falha ao reconciliar os plugins com o banco", run: async () => (await import("@/features/plugins/server/service")).reconcilePluginServers() },
    // Plugins do dono (OPE-172): crons registrados pela fiber stable de cada plugin. Ver aicontext/modules/plugins.md.
    { failureMessage: "[scheduler] Falha nos crons dos plugins", run: async (now: Date) => (await import("@/features/plugins/server/crons")).runPluginCrons(now) },
] as const
