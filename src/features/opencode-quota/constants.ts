/** Quota do OpenCode pedida ao plugin `opencode-quota` pelo RPC (`aicontext/modules/opencode-quota.md`). */

/** Evento em `private-app` quando a quota lida muda (payload: `{ checkedAt }`). */
export const OPENCODE_QUOTA_UPDATED_EVENT = "opencode-quota-updated"

export const OPENCODE_QUOTA_QUERY_KEY = "opencode-quota"

/** RPC do plugin no `opencode serve` (o mesmo canal do TUI). */
export const QUOTA_RPC_ID = "slkiser.opencode-quota"
export const QUOTA_RPC_METHOD = "refresh"
export const OPENCODE_QUOTA_RPC_TIMEOUT_MS = 60_000

/**
 * Motivo do `refresh`: `poll` respeita o intervalo, o backoff e o `retryAtMs` do plugin; `manual`
 * consulta todos os provedores na hora. (`turn` existe no plugin, mas o Opex não usa.)
 */
export const QUOTA_REFRESH_REASONS = ["poll", "manual"] as const
export type QuotaRefreshReason = (typeof QUOTA_REFRESH_REASONS)[number]
export const DEFAULT_QUOTA_BUTTON_REASON: QuotaRefreshReason = "manual"

/** Erro do provedor (código do plugin) → texto em pt-BR. `rate_limited` ganha "tente após HH:mm". */
export const QUOTA_ERROR_MESSAGES: Readonly<Record<string, string>> = {
    not_configured: "Provedor não configurado no OpenCode",
    login_expired: "Login expirado: entre de novo no provedor pelo OpenCode",
    no_plan: "A conta não tem plano com quota",
    rate_limited: "Limite de consultas atingido",
    timeout: "O provedor demorou demais para responder",
    network: "Falha de rede ao consultar o provedor",
    provider_error: "O provedor respondeu com erro",
    bad_response: "Resposta do provedor não reconhecida",
    no_data: "O provedor não informou a quota",
    local_tool: "Falha no programa local do provedor",
    internal: "Erro interno do opencode-quota",
}

/** Falhas do RPC → mensagem do painel. */
export const QUOTA_RPC_MESSAGES = {
    unavailable: "O plugin opencode-quota não respondeu no OpenCode: instale ou atualize o @slkiser/opencode-quota 6.x e reinicie o opencode serve.",
    unauthorized: "O OpenCode recusou a senha do servidor (HTTP 401): confira a senha na integração OpenCode.",
    timeout: "O opencode-quota não respondeu em 60 s.",
    network: "Não foi possível falar com o OpenCode",
    internal: "O opencode-quota falhou ao calcular a quota",
} as const

/** Sem nenhum provedor consultado há mais que isso, o painel avisa "Desatualizado". */
export const OPENCODE_QUOTA_STALE_MS = 30 * 60_000

/** Faixas de cor pelo percentual usado. */
export const QUOTA_WARNING_PERCENT = 60
export const QUOTA_CRITICAL_PERCENT = 85

/** Preferência do painel (recolhido/expandido) no navegador. */
export const OPENCODE_QUOTA_PANEL_KEY = "opex:opencode-quota-panel:v1"

/** Nomes legíveis dos provedores mais comuns; os demais usam o `label` do plugin. */
export const QUOTA_PROVIDER_NAMES: Readonly<Record<string, string>> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    "opencode-go": "OpenCode Go",
    opencode: "OpenCode Zen",
    copilot: "GitHub Copilot",
    openrouter: "OpenRouter",
    cursor: "Cursor",
    "google-agy": "Google AGY",
    "google-gemini-cli": "Gemini CLI",
    deepseek: "DeepSeek",
    xai: "xAI",
    "ollama-cloud": "Ollama Cloud",
    "quota-providers": "Personalizados",
}
