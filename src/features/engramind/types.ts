/**
 * Formatos devolvidos pela API do Engramind v0.8.0 (`docs/openapi.json` do repositório
 * `nandobfer/engramind`). Só os campos que o Opex usa; o resto passa adiante sem tipagem.
 */

export interface Ref {
    id: string
    slug: string
}

export interface WhoAmI {
    token_id: string
    kind: "admin" | "agent"
    scopes: string[]
    app: Ref
    agent: Ref | null
    operations: string[]
}

export interface EngramindApp {
    id: string
    slug: string
    name: string
    description: string | null
    created_at: string
    disabled_at: string | null
    webhook: { url: string; secret: { configured: boolean; updated_at: string | null } } | null
}

export interface EngramindAgent {
    id: string
    slug: string
    qualified_slug: string
    name: string
    description: string | null
    app: Ref
    created_at: string
    disabled_at: string | null
}

export interface EngramindToken {
    id: string
    prefix: string
    kind: "admin" | "agent"
    scopes: string[]
    app: Ref
    agent: Ref | null
    label: string | null
    status: "active" | "expired" | "revoked"
    created_at: string
    expires_at: string | null
    revoked_at: string | null
    last_used_at: string | null
}

export interface IssuedToken {
    token: EngramindToken
    secret?: string | null
}

export interface SettingMeta {
    key: string
    value: unknown
    default: unknown
    type: string
    description: string
    channel_override: boolean
    choices?: string[] | null
    min?: number | null
    max?: number | null
    secret?: boolean
    configured?: boolean | null
    updated_at?: string | null
    updated_by_app?: string | null
}

export interface ChannelSettingMeta {
    key: string
    type: string
    description: string
    value: unknown
    global: unknown
    override: unknown
    min?: number | null
    max?: number | null
}

export interface ChannelSettingsView {
    channel: string
    channel_id: string
    settings: ChannelSettingMeta[]
}

export interface Category {
    key: string
    label: string
    priority: number
}

export interface EngramindChannel {
    id: string
    slug: string
    name: string
    description: string | null
    priority: number
    version: number
    created_at: string
    archived_at: string | null
}

export interface ChannelStats {
    channel: string
    channel_id: string
    memories: { active: number; archived: number; permanent: number; total: number }
    by_category: Record<string, number> | { category: string; count: number }[]
    pending: { embedding: number; title: number }
    retrievals: number
    last_memory_at: string | null
    version: number
}

export interface EngramindSubscription {
    id: string
    agent: Ref & { qualified_slug?: string }
    target: string
    is_prefix: boolean
    mode: "inject" | "search" | "manage"
    access: string[] | null
    priority: number | null
    reaches: string[]
    created_at: string
}

export interface Author {
    app: string | null
    app_id: string | null
    agent: string | null
    agent_id: string | null
}

export interface EngramindMemory {
    id: string
    channel: string
    channel_id: string
    title: string | null
    title_state: "pending" | "ready" | "fallback"
    text: string
    category: string
    status: "active" | "permanent" | "archived"
    version: number
    author: Author
    embedding_state: "pending" | "ready" | "failed" | "off"
    retrieval_count: number
    created_at: string
    updated_at: string
    archived_at: string | null
}

export interface MemoryRevision {
    version: number
    text: string
    title: string | null
    category: string
    status: string
    reason: string | null
    author: Author
    created_at: string
}

export interface SearchResults {
    mode: "hybrid" | "text"
    results: { memory: EngramindMemory; rank: number; score: number }[]
}

export interface ImportResult {
    created: { index: number; id: string }[]
    duplicates: { index: number; existing_id: string }[]
}

export interface EngramindJob {
    id: number | string
    kind: string
    state: string
    attempts: number
    outcome: string | null
    last_error: string | null
    payload: unknown
    created_at: string
    run_after: string | null
    finished_at: string | null
}

export interface LlmCall {
    id: number | string
    at: string
    purpose: string
    provider: string
    model: string
    outcome: string
    input_tokens: number | null
    output_tokens: number | null
    cost_usd: number | null
    duration_ms: number | null
    error: string | null
}

export interface UsageReport {
    group_by: string
    since: string
    until: string
    total: { requests: number; memories: number; rendered_tokens: number }
    rows: { key: string; label: string | null; requests: number; memories: number; rendered_tokens: number }[]
}

export interface AuditEvent {
    id: number | string
    at: string
    action: string
    entity: string
    entity_id: string | null
    app_id: string | null
    agent_id: string | null
    token_id: string | null
    before: unknown
    after: unknown
}

export interface EngramindStatus {
    version: string
    uptime_seconds: number
    database: { status: string; size_bytes: number; migrations?: unknown }
    backup: { enabled: boolean; status: "ok" | "fail" | "skip"; detail: string | null; replica_age_seconds: number | null; last_replica_at: string | null; checked_at: string | null }
    counts: Record<string, number>
    queue: { pending: number; failed: number; by_kind: { kind: string; state: string; count: number }[] }
    redator: { enabled: boolean; configured: boolean; missing: string[]; provider: string | null; model: string | null; last_24h?: { calls: number; failures: number; cost_usd: number | null } }
    embedding: { enabled?: boolean; configured?: boolean; provider: string | null; model: string | null; model_id: string | null; dimensions: number | null; state: "off" | "ready" | "reindexing" | "failed"; total: number | null; done: number | null; missing?: string[]; reindex_started_at: string | null }
    webhooks: { enabled: boolean; apps: number; pending: number; delivered_24h: number; failed_24h: number }
    retention: { last_run_at: string; removed?: Record<string, number> } | null
}

/** Página de uma lista paginada por cursor (`next_cursor = null` na última). */
export interface CursorPage<T> {
    items: T[]
    nextCursor: string | null
}

/** Evento recebido pelo webhook (sem textos nem valores). */
export interface EngramindWebhookEvent {
    id: string
    type: string
    channel?: string | null
    channel_version?: number | null
    memory_ids?: string[]
    subscription?: string
    agent?: string
    target?: string
    keys?: string[]
    at: string
}

/** Estado da conexão mostrado na aba Conexão. */
export interface EngramindConnectionDto {
    baseUrl: string | null
    opexPublicUrl: string | null
    environmentId: string | null
    environmentName: string | null
    tokenConfigured: boolean
    webhookSecretConfigured: boolean
    webhookUrl: string | null
    configured: boolean
    whoami: WhoAmI | null
    /** Erro ao chamar `whoami` (token inválido, fora do ar...). */
    error: string | null
    /** O token ainda é do app `bootstrap`. */
    bootstrapPending: boolean
    /** Token admin com `read+write+delete`. */
    tokenSufficient: boolean
    webhook: { url: string | null; secretConfigured: boolean; updatedAt: string | null; matches: boolean } | null
}

export interface BootstrapStepDto {
    id: "whoami" | "app" | "token" | "save" | "revoke" | "webhook"
    status: "ok" | "skipped" | "failed"
    message: string
}

export interface ConnectionSaveResultDto {
    connection: EngramindConnectionDto
    steps: BootstrapStepDto[]
}

export type EnvEntryKind = "editable" | "write-only" | "read-only" | "unknown"

export interface EnvEntryDto {
    key: string
    kind: EnvEntryKind
    /** Valor (só em `editable` e `unknown`). */
    value?: string
    /** Sensíveis: se há valor gravado. */
    configured?: boolean
}

export interface EnvFileDto {
    hash: string
    entries: EnvEntryDto[]
    environment: { id: string; name: string; dir: string }
    pendingApply: { keys: string[]; at: string } | null
    apply: ApplyStateDto | null
}

export interface ApplyStateDto {
    id: string
    status: "running" | "success" | "failed"
    startedAt: string
    finishedAt: string | null
    error: string | null
}

export type ApplyEvent = { type: "log"; text: string } | { type: "status"; status: ApplyStateDto["status"]; error: string | null } | { type: "ping" }

export interface EnvironmentOptionDto {
    id: string
    name: string
    slug: string
    /** Pasta (adotado) ou origem central. */
    location: string
    machine: string
}
