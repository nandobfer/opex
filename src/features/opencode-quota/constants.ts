/** Quota do OpenCode lida do arquivo de export do plugin `opencode-quota` (`aicontext/modules/opencode-quota.md`). */

/** Evento em `private-app` quando a quota lida muda (payload: `{ checkedAt }`). */
export const OPENCODE_QUOTA_UPDATED_EVENT = "opencode-quota-updated"

export const OPENCODE_QUOTA_QUERY_KEY = "opencode-quota"

/** Caminho padrão do export no host do OpenCode (o mesmo que o plugin usa). */
export const OPENCODE_QUOTA_DEFAULT_PATH = "${XDG_CACHE_HOME:-$HOME/.cache}/opencode/quota-export.json"

/** Saída do comando quando o arquivo de export não existe (export desligado no plugin). */
export const OPENCODE_QUOTA_MISSING_MARKER = "__OPENCODE_QUOTA_MISSING__"

/** Primeira linha da saída: a quota veio do snapshot do plugin (`show --json`) ou do arquivo de export (reserva). */
export const OPENCODE_QUOTA_SNAPSHOT_MARKER = "__OPENCODE_QUOTA_SNAPSHOT__"
export const OPENCODE_QUOTA_EXPORT_MARKER = "__OPENCODE_QUOTA_EXPORT__"

/** Executável do plugin instalado pelo OpenCode no host (glob de shell; o mais recente vence). */
export const OPENCODE_QUOTA_CLI_GLOB = '"${XDG_CACHE_HOME:-$HOME/.cache}"/opencode/npm/@slkiser/opencode-quota@*/*/node_modules/@slkiser/opencode-quota/dist/bin/opencode-quota.js'

/** Sem regravação do export há mais que isso, o painel avisa "Desatualizado". */
export const OPENCODE_QUOTA_STALE_MS = 30 * 60_000

/** Faixas de cor pelo percentual usado. */
export const QUOTA_WARNING_PERCENT = 60
export const QUOTA_CRITICAL_PERCENT = 85

/** Preferência do painel (recolhido/expandido) no navegador. */
export const OPENCODE_QUOTA_PANEL_KEY = "opex:opencode-quota-panel:v1"

/** Nomes legíveis dos provedores mais comuns; os demais vêm do nome das linhas. */
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
