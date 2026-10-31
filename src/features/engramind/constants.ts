/**
 * Constantes da integração Engramind (o Opex como gestor da rede de memórias). Ver
 * `aicontext/modules/engramind.md`.
 */

export const ENGRAMIND_INTEGRATION_ID = "engramind" as const
/** Raiz das chaves do TanStack Query da feature. */
export const ENGRAMIND_QUERY_KEY = "engramind"
/** Evento em `private-app` (payload `{ type, channel?, keys? }`). */
export const ENGRAMIND_UPDATED_EVENT = "engramind-updated"
/** Entidade da auditoria do Opex. */
export const ENGRAMIND_AUDIT_ENTITY = "Engramind"
/** App do próprio Opex na rede do Engramind (criado no bootstrap). */
export const OPEX_APP_SLUG = "opex"
export const OPEX_APP_NAME = "Opex"
export const OPEX_TOKEN_LABEL = "Opex"
/** App criado pelo `BOOTSTRAP_ADMIN_TOKEN` (mantido depois do bootstrap). */
export const BOOTSTRAP_APP_SLUG = "bootstrap"
/** Caminho do webhook recebido pelo Opex (fora do login; autenticado pela assinatura). */
export const ENGRAMIND_WEBHOOK_PATH = "/api/engramind/webhook"
/** Janela aceita entre o `t` da assinatura e o relógio do Opex. */
export const WEBHOOK_TOLERANCE_SECONDS = 300
/** Página do Engramind no app. */
export const ENGRAMIND_PAGE_HREF = "/engramind"
export const ENGRAMIND_INTEGRATION_HREF = "/integracoes/engramind"

export const ENGRAMIND_TABS = ["sobre", "conexao", "configuracoes", "provedores", "identidades", "operacao", "variaveis"] as const
export type EngramindTab = (typeof ENGRAMIND_TABS)[number]

export const ENGRAMIND_PAGE_TABS = ["canais", "memorias"] as const
export type EngramindPageTab = (typeof ENGRAMIND_PAGE_TABS)[number]

/** Escopos e as únicas combinações aceitas pelo Engramind (`write`/`delete` exigem `read`). */
export const ENGRAMIND_SCOPES = ["read", "write", "delete"] as const
export type EngramindScope = (typeof ENGRAMIND_SCOPES)[number]
export const SCOPE_COMBINATIONS = ["read", "read+write", "read+delete", "read+write+delete"] as const
export type ScopeCombination = (typeof SCOPE_COMBINATIONS)[number]
export const scopesOfCombination = (combination: ScopeCombination): EngramindScope[] => combination.split("+") as EngramindScope[]
export function combinationOf(scopes: readonly string[]): ScopeCombination | null {
    const key = ENGRAMIND_SCOPES.filter((scope) => scopes.includes(scope)).join("+")
    return (SCOPE_COMBINATIONS as readonly string[]).includes(key) && key.split("+").length === scopes.length ? (key as ScopeCombination) : null
}

export const TOKEN_KINDS = ["admin", "agent"] as const
export const SUBSCRIPTION_MODES = ["inject", "search", "manage"] as const
export const MEMORY_STATUSES = ["active", "permanent", "archived"] as const
export const JOB_KINDS = ["redact", "embed", "webhook"] as const
export const JOB_STATES = ["queued", "running", "done", "failed"] as const
export const USAGE_GROUPS = ["day", "agent", "operation", "channel"] as const
export const LLM_PURPOSES = ["redact", "test"] as const
export const EMBEDDING_PROVIDERS = ["local", "openai_compatible", "ollama", "gemini", "off"] as const
/** Provedores que não listam modelos (`PROVIDER_LISTING_UNSUPPORTED`). */
export const NO_LISTING_PROVIDERS: readonly string[] = ["gemini", "off"]
export const AUDIT_ENTITIES = ["app", "agent", "token", "settings", "secret", "job", "memory", "channel"] as const
export const SECRET_KEYS = ["redator.api_key", "embedding.api_key"] as const
export type EngramindSecretKey = (typeof SECRET_KEYS)[number]

/** Grupos das configurações (prefixo da chave), na ordem da tela. */
export const SETTING_GROUPS = ["limits", "categories", "memory", "context", "redator", "embedding", "search", "webhooks", "retention"] as const
export const SETTING_GROUP_LABELS: Record<(typeof SETTING_GROUPS)[number], string> = {
    limits: "Limites",
    categories: "Categorias",
    memory: "Memória",
    context: "Contexto",
    redator: "Redator",
    embedding: "Embeddings",
    search: "Busca",
    webhooks: "Webhooks",
    retention: "Retenção",
}
/** Trocar uma destas chaves valida o provedor de embedding e reindexa as memórias. */
export const REINDEX_SETTING_KEYS: readonly string[] = ["embedding.provider", "embedding.model", "embedding.base_url", "embedding.dimensions", "embedding.query_prefix", "embedding.document_prefix"]

/** Variáveis do `.env` do Engramind por tratamento. */
export const ENV_EDITABLE_KEYS = [
    "APP_ENV",
    "APP_HOST",
    "APP_PORT",
    "CONTAINER_NAME",
    "DATABASE_PATH",
    "MODELS_PATH",
    "ORT_DYLIB_PATH",
    "READ_POOL_SIZE",
    "REQUEST_TIMEOUT_SECS",
    "MAX_BODY_BYTES",
    "MCP_ALLOWED_HOSTS",
    "ENGRAMIND_NETWORK",
    "S3_NETWORK",
    "LITESTREAM_ENABLED",
    "ENGRAMIND_S3_BUCKET",
    "ENGRAMIND_S3_PATH",
    "ENGRAMIND_S3_ENDPOINT",
    "LITESTREAM_ACCESS_KEY_ID",
    "RUST_LOG",
    "LOG_FORMAT",
    "LOG_ANSI",
    "TZ",
] as const
export type EnvEditableKey = (typeof ENV_EDITABLE_KEYS)[number]
/** Só gravar: o valor nunca é lido de volta. */
export const ENV_WRITE_ONLY_KEYS = ["LITESTREAM_SECRET_ACCESS_KEY"] as const
/** Só leitura (configurada/não), nunca editáveis pelo Opex. */
export const ENV_READ_ONLY_KEYS = ["TOKEN_PEPPER", "SECRETS_KEY", "BOOTSTRAP_ADMIN_TOKEN"] as const
/** Valores que nunca saem do host (mascarados lá mesmo). */
export const ENV_SENSITIVE_KEYS: readonly string[] = [...ENV_WRITE_ONLY_KEYS, ...ENV_READ_ONLY_KEYS]
/** O `docker-compose.yml` do Engramind fixa ou não repassa estas: o valor do `.env` não chega ao container. */
export const ENV_COMPOSE_FIXED_KEYS: readonly string[] = ["APP_HOST", "DATABASE_PATH", "MODELS_PATH", "ORT_DYLIB_PATH"]
/** Entram no nome do projeto (`engramind-${APP_PORT}`) ou do container: trocar exige derrubar o projeto antigo. */
export const ENV_PROJECT_KEYS: readonly string[] = ["APP_PORT", "CONTAINER_NAME"]
/** Trocar pode exigir ajustar a URL base da integração. */
export const ENV_URL_KEYS: readonly string[] = ["APP_PORT", "APP_HOST"]
/** Serviço do compose do Engramind. */
export const ENGRAMIND_COMPOSE_SERVICE = "api"
/** Override de produção (imagem pronta, sem build/pull no servidor). */
export const ENGRAMIND_DEPLOY_COMPOSE_FILE = "docker-compose.deploy.yml"
/** Marcadores que substituem os valores sensíveis no host (o segredo nunca sai de lá). */
export const ENV_MASK_SET = "__OPEX_ENV_SET__"
export const ENV_MASK_EMPTY = "__OPEX_ENV_EMPTY__"
/** Tempo do "Ver token" emitido pelo Agente Opex. */
export const TOKEN_REVEAL_TTL_MS = 10 * 60_000
/** Máximo de páginas lidas para recortar a auditoria por período. */
export const AUDIT_MAX_PAGES = 20
