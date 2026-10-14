/**
 * Vocabulário e caminhos do módulo **Ambientes** (módulo PURO).
 *
 * Ambientes gerenciam os containers em execução no servidor de cada repositório vinculado
 * (o **Projeto**): leem o `docker-compose`, acompanham logs, publicam versões (build/deploy) e
 * restauram imagens, com bloqueio por compatibilidade de banco. O dono vê todos os repositórios;
 * o cliente vê apenas os projetos vinculados a ele (`OrcamentoClient.projectIds`).
 */

/** Rotas do dono. */
export const AMBIENTES_PATH = "/ambientes"
/** Rotas do portal do cliente (espelhadas). */
export const CLIENTE_AMBIENTES_PATH = "/cliente/ambientes"

/** Porta padrão do SSH (modo Remoto). */
export const DEFAULT_SSH_PORT = 22

export const DEFAULT_COMPOSE_FILE = "docker-compose.yml"
export const DEFAULT_HEALTHCHECK_PATH = "/"
export const DEFAULT_HEALTHCHECK_TIMEOUT_MS = 60_000
export const MIN_HEALTHCHECK_TIMEOUT_MS = 1_000
export const MAX_HEALTHCHECK_TIMEOUT_MS = 600_000

/** Limite de tamanho do arquivo Compose lido pela API do GitHub. */
export const MAX_COMPOSE_BYTES = 256 * 1024
/** Limite de saída de comando guardada por etapa. */
export const MAX_OUTPUT_CHARS = 20_000
/** Lease de uma operação em andamento: passou disso sem heartbeat, a operação é considerada órfã. */
export const OPERATION_LEASE_MS = 15 * 60_000
/** Tempo de vida de uma sessão de logs sem heartbeat (aba fechada de forma abrupta). */
export const LOG_SESSION_TTL_MS = 5 * 60_000
/** Intervalo do coletor de logs ao vivo dos containers. */
export const LOG_COLLECTOR_INTERVAL_MS = 3_000
/** Intervalo mínimo entre duas consultas de estado do host (evita bater no Docker a cada leitura). */
export const STATUS_REFRESH_MS = 8_000
/** Arquivo `.env` padrão do ambiente (relativo ao diretório do repositório). */
export const DEFAULT_ENV_FILE = ".env"
/** Tamanho máximo do `.env` lido/gravado no host. */
export const MAX_ENV_FILE_BYTES = 128 * 1024
/** Número máximo de variáveis devolvidas/editadas do `.env`. */
export const MAX_ENV_VARS = 300

/** Evento em `private-app`/canal do cliente quando os ambientes mudam. Payload: `{ scope, projectId? }`. */
export const ENVIRONMENTS_UPDATED_EVENT = "environments-updated"
/** Evento no canal do ambiente quando uma operação avança/termina. */
export const ENVIRONMENT_OPERATION_EVENT = "environment-operation-updated"
/** Evento no canal do ambiente com as linhas de log ao vivo. */
export const ENVIRONMENT_LOG_EVENT = "environment-log"

export const ENVIRONMENT_AUDIT_ENTITY = "Ambiente"
export const ENVIRONMENT_REPO_AUDIT_ENTITY = "AmbienteRepositorio"
export const ENVIRONMENT_OPERATION_AUDIT_ENTITY = "AmbienteOperacao"

/** Abas da coluna direita do workspace. A primeira é a padrão (omitida da URL). */
export const ENVIRONMENT_TABS = ["compose", "logs", "publish", "restore", "cicd"] as const
export type EnvironmentTab = (typeof ENVIRONMENT_TABS)[number]

export const isEnvironmentTab = (value: string): value is EnvironmentTab =>
    (ENVIRONMENT_TABS as readonly string[]).includes(value)

/** Página de configuração do repositório. */
export const environmentRepoConfigPath = (projectId: string) => `${AMBIENTES_PATH}/${projectId}/config`
/** Novo/editar ambiente (`envId` = `novo` cria). */
export const environmentEditPath = (projectId: string, envId: string) => `${AMBIENTES_PATH}/${projectId}/ambiente/${envId}`
export const NEW_ENVIRONMENT_ID = "novo"

/** Caminhos espelhados do portal. */
export const clienteAmbientesRepoPath = (projectId: string) => `${CLIENTE_AMBIENTES_PATH}/${projectId}`
export const clienteAmbientesConfigPath = (projectId: string) => `${CLIENTE_AMBIENTES_PATH}/${projectId}/config`
export const clienteAmbienteEditPath = (projectId: string, envId: string) => `${CLIENTE_AMBIENTES_PATH}/${projectId}/ambiente/${envId}`

/** Guarda o último repositório selecionado no navegador (chave versionada por contexto). */
export const lastRepoStorageKey = (kind: "owner" | "client") => `opex:ambientes:repo:${kind}:v1`
