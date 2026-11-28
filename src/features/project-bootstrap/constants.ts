/**
 * Bootstrap de projeto (OPE-215, módulo puro): criar um repositório novo e provisionar o ambiente do
 * zero a partir da Nova central. O nome `project-bootstrap` evita a confusão com o bootstrap do
 * Engramind e o da Builder Machine.
 */

/** Feature em `ai_feature_settings` (configuração do Agente de Bootstrap). */
export const PROJECT_BOOTSTRAP_FEATURE = "project-bootstrap"
/** Aba do agente em `/integracoes/ia` (fora do catálogo de agentes: sem item na sidebar). */
export const PROJECT_BOOTSTRAP_AI_TAB = "agente-bootstrap" as const
export const PROJECT_BOOTSTRAP_SETTINGS_HREF = `/integracoes/ia?aba=${PROJECT_BOOTSTRAP_AI_TAB}`
export const PROJECT_BOOTSTRAP_NEW_PATH = "/integracoes/ia/bootstraps/novo"
export const projectBootstrapPath = (id: string) => `/integracoes/ia/bootstraps/${id}`
export const projectBootstrapNewPath = (repo: string) => `${PROJECT_BOOTSTRAP_NEW_PATH}?repo=${encodeURIComponent(repo)}`

/** Skills do OpenCode do host usadas por padrão (instaladas em `~/.agents/skills`). */
export const DEFAULT_PROJECT_BOOTSTRAP_SKILLS = ["bootstrap-agents-md", "bootstrap-aicontext", "bootstrap-docker"] as const
export const OPENCODE_SKILLS_HREF = "/integracoes/ia/opencode?aba=skills"

/** Etapas do stepper (a primeira é o formulário; o bootstrap nasce já na segunda). */
export const PROJECT_BOOTSTRAP_STEPS = ["info", "provision", "link", "deploy", "done"] as const
export type ProjectBootstrapStep = (typeof PROJECT_BOOTSTRAP_STEPS)[number]
export const PROJECT_BOOTSTRAP_STEP_LABELS: Record<ProjectBootstrapStep, string> = {
    info: "Informações",
    provision: "Provisionamento",
    link: "Amarração",
    deploy: "Ambiente e deploy",
    done: "Concluído",
}

/** `waiting`: o agente aguarda o dono (pergunta, permissão ou turno encerrado sem o resumo final). */
export const PROJECT_BOOTSTRAP_STATUSES = ["running", "waiting", "failed", "done", "cancelled"] as const
export type ProjectBootstrapStatus = (typeof PROJECT_BOOTSTRAP_STATUSES)[number]
export const PROJECT_BOOTSTRAP_STATUS_LABELS: Record<ProjectBootstrapStatus, string> = {
    running: "Executando",
    waiting: "Aguardando você",
    failed: "Falhou",
    done: "Concluído",
    cancelled: "Cancelado",
}
export const ACTIVE_BOOTSTRAP_STATUSES: readonly ProjectBootstrapStatus[] = ["running", "waiting", "failed"]

export const PROJECT_BOOTSTRAP_ACTIONS = ["retry", "cancel", "reconnect"] as const
export type ProjectBootstrapAction = (typeof PROJECT_BOOTSTRAP_ACTIONS)[number]

/** Eventos em `private-app`. Payload `{ id }` e `{ kind }`. */
export const PROJECT_BOOTSTRAP_UPDATED_EVENT = "project-bootstrap-updated"
export const PROJECT_BOOTSTRAP_CATALOG_UPDATED_EVENT = "project-bootstrap-catalog-updated"

export const PROJECT_BOOTSTRAP_AUDIT_ENTITY = "BootstrapProjeto"
export const PROJECT_BOOTSTRAP_TECH_AUDIT_ENTITY = "TecnologiaBootstrap"
export const PROJECT_BOOTSTRAP_TECH_GROUP_AUDIT_ENTITY = "GrupoTecnologiaBootstrap"

/** Origem do consumo de IA (`ai_consumption_logs`) dos turnos do agente. */
export const PROJECT_BOOTSTRAP_CONSUMPTION_ORIGIN = "project-bootstrap"
/** Chave das instruções duráveis da sessão do OpenCode. */
export const PROJECT_BOOTSTRAP_INSTRUCTIONS_KEY = "opex-bootstrap"
export const PROJECT_BOOTSTRAP_STAGE_LABEL = "Agente de Bootstrap"

/** Arquivo onde as portas do host são anotadas (`<porta> -> <projeto>`). */
export const USED_PORTS_FILE = "/home/used_ports"

export const BOOTSTRAP_TIMEOUT_MIN = 10
export const BOOTSTRAP_TIMEOUT_MAX = 360
export const BOOTSTRAP_TIMEOUT_DEFAULT = 120

/** Batimento do bootstrap em andamento e quando ele conta como perdido (reinício do app). */
export const BOOTSTRAP_HEARTBEAT_MS = 15_000
export const BOOTSTRAP_STALE_MS = 90_000
/** Intervalo da conferência do deploy em andamento (o registro do deploy é a fonte de verdade). */
export const BOOTSTRAP_DEPLOY_POLL_MS = 3_000
/** Fim do log do deploy que vai ao agente quando o deploy falha. */
export const BOOTSTRAP_DEPLOY_LOG_TAIL = 6_000

export const DEFAULT_PROJECT_BOOTSTRAP_INSTRUCTIONS = ""
