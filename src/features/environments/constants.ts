/**
 * Módulo "Ambientes" (`environments`): ambientes Docker Compose gerenciados pelo app no servidor e no PC
 * (pela conexão do Builder Machine), com build e execução em máquinas diferentes por um registry local.
 * Ver `aicontext/modules/environments.md`.
 */

export const ENVIRONMENTS_FEATURE = "environments" as const
export const ENVIRONMENTS_PATH = "/ambientes"

/** Evento em `private-app`: `{ id, change }` (um ambiente ou a lista mudou). */
export const ENVIRONMENTS_EVENT = "environments"
export const ENVIRONMENTS_AUDIT_ENTITY = "Ambiente"
export const ENVIRONMENTS_QUERY_KEY = "environments" as const

/** Portal do cliente (`/cliente/ambientes`): evento `{ id, change }` em `private-client-{clientId}`. */
export const CLIENTE_ENVIRONMENTS_EVENT = "cliente-environments-updated"
/** Ações do portal: implantar a ref salva, levantar ou reiniciar (só admin do cliente). */
export const PORTAL_ENVIRONMENT_ACTIONS = ["deploy", "up", "restart"] as const
export type PortalEnvironmentAction = (typeof PORTAL_ENVIRONMENT_ACTIONS)[number]
export const PORTAL_ACTION_LABELS: Record<PortalEnvironmentAction, string> = { deploy: "Implantar", up: "Levantar", restart: "Reiniciar" }

/** Container do registry no servidor (só em `127.0.0.1:<porta>`). */
export const REGISTRY_CONTAINER = "opex-registry"
export const REGISTRY_IMAGE = "registry:2"
/** Repositório das imagens no registry: `opex-env/<slug>-<serviço>`. */
export const REGISTRY_NAMESPACE = "opex-env"

/** Arquivos gerados na pasta do ambiente. */
export const OVERRIDE_FILE = "docker-compose.opex.yml"
export const ENV_FILE = ".env.opex"

/** Deploys ficam 90 dias (TTL em `environment_deploys`). */
export const DEPLOY_TTL_SECONDS = 90 * 24 * 60 * 60
/** Log guardado por deploy (o fim, quando passar). */
export const DEPLOY_LOG_MAX = 400_000
/** Intervalo do sinal de vida (e da gravação do log) do deploy em andamento. */
export const DEPLOY_HEARTBEAT_MS = 5_000
/** Sinal de vida mais velho que isto: o processo do deploy morreu e outro pode retomá-lo. */
export const DEPLOY_STALE_MS = 60_000
/** Espera pela URL de saúde depois de subir. */
export const HEALTH_TIMEOUT_MS = 120_000

/** Label do compose usado na descoberta. */
export const COMPOSE_LABELS = {
    project: "com.docker.compose.project",
    service: "com.docker.compose.service",
    workingDir: "com.docker.compose.project.working_dir",
    configFiles: "com.docker.compose.project.config_files",
} as const
