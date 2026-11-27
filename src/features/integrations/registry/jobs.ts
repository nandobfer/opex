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

/** Textos de ajuda das capacidades das rotinas do Opex (os mesmos de antes da biblioteca). */
const TAGS_SCOPE_HELP = "“Só pendentes” marca apenas as tarefas sem tags ou com título/descrição alterados; “Todas” regenera as tags de todo o escopo."
const OPENCODE_RETENTION_HELP =
    "Exclui do OpenCode TODAS as sessões sem interação há esse número de dias, inclusive as suas pessoais (TUI/desktop). Nunca exclui as que estão rodando nem as vinculadas ao Opex (mesas, forks, refinamentos, revisões de PR, Agente Adversário e Agente Maddox)."
const agentRetentionHelp = (agent: string) =>
    `Arquiva as sessões do ${agent} (dono e portal) sem interação há esse número de dias e exclui de vez as arquivadas há esse mesmo tempo. Sessões respondendo, aguardando confirmação ou com job ativo ficam de fora.`

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
    internal(TASK_TAGS_CONCLUDED_JOB_ID, "Gerar tags de tarefas concluídas (IA)", { type: "interval", minutes: 60 }, false, { scope: "pending" }, { scope: { help: TAGS_SCOPE_HELP } }),
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
    internal(OPENCODE_SESSIONS_CLEANUP_JOB_ID, "Limpar sessões do OpenCode sem interação", { type: "daily", time: "05:00" }, false, { retentionDays: DEFAULT_SESSION_RETENTION_DAYS }, { retentionDays: { help: OPENCODE_RETENTION_HELP } }),
    internal(OPEX_AGENT_SESSIONS_CLEANUP_JOB_ID, "Limpar sessões do Agente Opex sem interação", { type: "daily", time: "05:00" }, false, { retentionDays: DEFAULT_SESSION_RETENTION_DAYS }, { retentionDays: { help: agentRetentionHelp("Agente Opex") } }),
    internal(MADDOX_AGENT_SESSIONS_CLEANUP_JOB_ID, "Limpar sessões do Agente Maddox sem interação", { type: "daily", time: "05:00" }, false, { retentionDays: DEFAULT_SESSION_RETENTION_DAYS }, { retentionDays: { help: agentRetentionHelp("Agente Maddox") } }),
    internal(ENGRAMIND_PENDING_WRITES_JOB_ID, "Reprocessar memórias pendentes do Engramind", { type: "interval", minutes: 1 }, true),
]

/** Rotinas padrão (a configuração das rotinas internas antes de o dono salvar os Crons). */
export const DEFAULT_CRON_JOBS: CronJobDeclaration["job"][] = OPEX_CRON_JOBS.map((declaration) => declaration.job)

/** Rotinas internas de uma integração ativável (id da rotina → id da integração): somem de Crons com ela desativada. */
export const INTEGRATION_CRON_JOBS: Readonly<Record<string, string>> = Object.fromEntries(
    OPEX_CRON_JOBS.flatMap((declaration) => (declaration.capabilities?.integration ? [[declaration.job.id, declaration.capabilities.integration]] : [])),
)

export function cronJobIntegration(jobId: string): string | null {
    return INTEGRATION_CRON_JOBS[jobId] ?? null
}

/** Texto de ajuda dos dias sem interação de uma rotina de limpeza de sessões. */
export function retentionHelp(jobId: string): string {
    const help = OPEX_CRON_JOBS.find((declaration) => declaration.job.id === jobId)?.capabilities?.retentionDays
    return typeof help === "object" ? help.help : ""
}
