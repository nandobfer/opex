/** Constantes das contas dos providers do OpenCode (módulo puro). */

/** Evento em `private-app` quando as contas de um provider mudam. Payload: `{ integrationId }`. */
export const OPENCODE_ACCOUNTS_UPDATED_EVENT = "opencode-accounts-updated"

export const OPENCODE_ACCOUNTS_AUDIT_ENTITY = "ContaOpenCode"

/** Intervalo de consulta do status de um login em andamento (OAuth automático ou comando). */
export const OPENCODE_LOGIN_POLL_MS = 1500

export const OPENCODE_ACCOUNT_LABEL_MAX = 120

export const OPENCODE_METHOD_KIND_LABELS = {
    key: "Chave de API",
    oauth: "Login (OAuth)",
    command: "Comando",
} as const
