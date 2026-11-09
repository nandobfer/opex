/**
 * URLs oficiais das APIs dos provedores de IA (módulo PURO, sem SDK). Reexportadas pelos módulos de
 * cada provedor; o Engramind usa as mesmas para a URL implícita do provedor escolhido.
 */

export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1"
export const DEEPSEEK_API_URL = "https://api.deepseek.com"
export const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta"
export const OPENAI_API_URL = "https://api.openai.com/v1"
/** Gateway do OpenCode Go (plano Go): cada família de API tem a sua base abaixo desta raiz. */
export const OPENCODE_GO_BASE_URL = "https://opencode.ai/inference/go"
export const OPENCODE_GO_API_URL = `${OPENCODE_GO_BASE_URL}/openai/v1`
/** `User-Agent` próprio exigido pelo Go para clientes de terceiros (não o nome genérico da SDK). */
export const OPENCODE_GO_USER_AGENT = "Opex (opencode-go; +https://github.com/nandobfer/opex)"
