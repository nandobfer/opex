import { DEFAULT_SESSION_RETENTION_DAYS, HEALTH_CHECK_JOB_ID, type CronJobDeclaration } from "@nandobfer/integracoes"
import { HEALTH_CHECK_JOB } from "@nandobfer/integracoes/crons"
import { AI_CRON_JOBS, AI_SUBSCRIPTION_DAYS_JOB_ID, COMMAND_CODE_USAGE_JOB_ID, FX_PTAX_JOB_ID, OPENCODE_GO_USAGE_JOB_ID } from "@nandobfer/integracoes/ia"

/**
 * Rotinas internas do Opex (integração Crons), na ordem em que aparecem na tela. Módulo PURO: ids,
 * padrão e capacidades de cada rotina. Os executores ficam no adaptador de servidor
 * (`registry/server-jobs.ts`). As rotinas da biblioteca (verificação de status e as de IA) entram
 * aqui pelo próprio id, só para manter a ordem; a declaração vale a primeira.
 */

export { HEALTH_CHECK_JOB_ID, OPENCODE_GO_USAGE_JOB_ID, COMMAND_CODE_USAGE_JOB_ID, FX_PTAX_JOB_ID, AI_SUBSCRIPTION_DAYS_JOB_ID }

export const GITHUB_ISSUE_SYNC_JOB_ID = "github-issue-sync"
export const AGENTIC_PR_WATCH_JOB_ID = "agentic-pr-watch"
export const AGENTIC_QUEUE_JOB_ID = "agentic-queue-pump"
export const TASK_SUMMARY_JOB_ID = "ai-task-summary"
export const TASK_TAGS_JOB_ID = "ai-task-tags"
export const TASK_TAGS_CONCLUDED_JOB_ID = "ai-task-tags-concluded"
/** Limpeza de anexos abandonados (uploads nunca vinculados) e remoções pendentes no storage. */
export const ATTACHMENT_CLEANUP_JOB_ID = "task-attachments-cleanup"
/** Limpeza dos arquivos do chat do Agente Opex enviados e não usados numa mensagem em 24 h (S3 + metadados). */
export const OPEX_FILES_CLEANUP_JOB_ID = "opex-files-cleanup"
/** Métricas dos agentes (OPE-122): sincroniza as execuções e conversas e gera o resumo diário de uso. */
export const AGENT_USAGE_DAILY_JOB_ID = "agent-usage-daily"
/** Builder Machine: limpeza das imagens órfãs e do cache do builder do PC. */
export const BUILDER_MACHINE_CLEANUP_JOB_ID = "builder-machine-cleanup"
/** Pede a quota ao plugin opencode-quota (RPC, motivo poll) e avisa a tela quando muda. */
export const OPENCODE_QUOTA_JOB_ID = "opencode-quota-refresh"
/** Lê CPU, RAM, swap e disco da máquina do OpenCode (RPC do opencode-htop ou shell) e avisa a tela quando muda. */
export const HOST_METRICS_JOB_ID = "host-metrics-refresh"
/** Engramind (OPE-192): reprocessa as gravações de memória que ficaram na fila com o Engramind fora do ar. */
export const ENGRAMIND_PENDING_WRITES_JOB_ID = "engramind-pending-writes"
/** Ambientes: mantém as últimas tags de cada ambiente no registry e roda o garbage-collect. */
export const ENVIRONMENTS_REGISTRY_CLEANUP_JOB_ID = "environments-registry-cleanup"
/** Exclui as sessões do servidor OpenCode sem interação há X dias (nunca as vinculadas ao Opex nem as em execução). */
export const OPENCODE_SESSIONS_CLEANUP_JOB_ID = "opencode-sessions-cleanup"
/** Agente Opex: arquiva as sessões sem interação há X dias e exclui as arquivadas há X dias. */
export const OPEX_AGENT_SESSIONS_CLEANUP_JOB_ID = "opex-agent-sessions-cleanup"
/** Agente Maddox: arquiva as sessões sem interação há X dias e exclui as arquivadas há X dias. */
export const MADDOX_AGENT_SESSIONS_CLEANUP_JOB_ID = "maddox-agent-sessions-cleanup"

/** Rotinas de limpeza de sessões: aceitam `retentionDays`. */
export const SESSION_CLEANUP_JOB_IDS: readonly string[] = [OPENCODE_SESSIONS_CLEANUP_JOB_ID, OPEX_AGENT_SESSIONS_CLEANUP_JOB_ID, MADDOX_AGENT_SESSIONS_CLEANUP_JOB_ID]

const aiJob = (id: string): CronJobDeclaration => AI_CRON_JOBS.find((item) => item.job.id === id)!

const internal = (id: string, label: string, schedule: CronJobDeclaration["job"]["schedule"], enabled: boolean, extra: Partial<CronJobDeclaration["job"]> = {}, capabilities?: CronJobDeclaration["capabilities"]): CronJobDeclaration => ({
    job: { id, label, kind: "internal", schedule, enabled, ...extra },
    ...(capabilities ? { capabilities } : {}),
})

export const OPEX_CRON_JOBS: readonly CronJobDeclaration[] = [
    HEALTH_CHECK_JOB,
    internal(GITHUB_ISSUE_SYNC_JOB_ID, "Sincronizar issues do GitHub", { type: "interval", minutes: 2 }, true),
    internal(AGENTIC_PR_WATCH_JOB_ID, "Acompanhar e revisar PRs (desenvolvimento agêntico e Agente Revisor)", { type: "interval", minutes: 2 }, true),
    internal(AGENTIC_QUEUE_JOB_ID, "Processar a fila do desenvolvimento agêntico", { type: "interval", minutes: 1 }, true),
    internal(TASK_SUMMARY_JOB_ID, "Gerar resumos de tarefas (IA)", { type: "interval", minutes: 2 }, true),
    internal(TASK_TAGS_JOB_ID, "Gerar tags de tarefas (IA)", { type: "interval", minutes: 3 }, true),
    internal(TASK_TAGS_CONCLUDED_JOB_ID, "Gerar tags de tarefas concluídas (IA)", { type: "interval", minutes: 60 }, false, { scope: "pending" }, { scope: true }),
    internal(ATTACHMENT_CLEANUP_JOB_ID, "Limpar anexos abandonados das tarefas", { type: "interval", minutes: 30 }, true),
    internal(OPEX_FILES_CLEANUP_JOB_ID, "Limpar arquivos pendentes do chat do Agente Opex", { type: "interval", minutes: 60 }, true),
    internal(AGENT_USAGE_DAILY_JOB_ID, "Gerar o resumo diário de uso dos agentes (métricas)", { type: "interval", minutes: 60 }, true),
    internal(OPENCODE_QUOTA_JOB_ID, "Atualizar a quota do OpenCode (opencode-quota)", { type: "interval", minutes: 1 }, true),
    aiJob(OPENCODE_GO_USAGE_JOB_ID),
    aiJob(COMMAND_CODE_USAGE_JOB_ID),
    aiJob(FX_PTAX_JOB_ID),
    aiJob(AI_SUBSCRIPTION_DAYS_JOB_ID),
    internal(HOST_METRICS_JOB_ID, "Ler CPU, RAM, swap e disco do servidor (opencode-htop)", { type: "interval", seconds: 10 }, true),
    // Ligada ao ativar a integração Builder Machine; some de Crons com ela desativada.
    internal(BUILDER_MACHINE_CLEANUP_JOB_ID, "Limpar imagens órfãs e cache do builder do PC (Builder Machine)", { type: "daily", time: "03:00" }, false, {}, { integration: "builder_machine" }),
    internal(ENVIRONMENTS_REGISTRY_CLEANUP_JOB_ID, "Limpar tags antigas do registry dos ambientes (Ambientes)", { type: "daily", time: "04:00" }, false),
    // Limpezas de sessões: nascem desligadas (ação destrutiva); o dono liga e ajusta os dias.
    internal(OPENCODE_SESSIONS_CLEANUP_JOB_ID, "Limpar sessões do OpenCode sem interação", { type: "daily", time: "05:00" }, false, { retentionDays: DEFAULT_SESSION_RETENTION_DAYS }, { retentionDays: true }),
    internal(OPEX_AGENT_SESSIONS_CLEANUP_JOB_ID, "Limpar sessões do Agente Opex sem interação", { type: "daily", time: "05:00" }, false, { retentionDays: DEFAULT_SESSION_RETENTION_DAYS }, { retentionDays: true }),
    internal(MADDOX_AGENT_SESSIONS_CLEANUP_JOB_ID, "Limpar sessões do Agente Maddox sem interação", { type: "daily", time: "05:00" }, false, { retentionDays: DEFAULT_SESSION_RETENTION_DAYS }, { retentionDays: true }),
    internal(ENGRAMIND_PENDING_WRITES_JOB_ID, "Reprocessar memórias pendentes do Engramind", { type: "interval", minutes: 1 }, true),
]
