/** Constantes do serviço do OpenCode (aba Controles) — módulo puro. */

export const OPENCODE_SERVICE_ACTIONS = ["start", "stop", "restart", "upgrade"] as const
export type OpencodeServiceAction = (typeof OPENCODE_SERVICE_ACTIONS)[number]

export const OPENCODE_SERVICE_ACTION_LABELS: Record<OpencodeServiceAction, { verb: string; done: string; running: string }> = {
    start: { verb: "Iniciar", done: "Serviço iniciado", running: "Iniciando" },
    stop: { verb: "Parar", done: "Serviço parado", running: "Parando" },
    restart: { verb: "Reiniciar", done: "Serviço reiniciado", running: "Reiniciando" },
    upgrade: { verb: "Atualizar OpenCode", done: "OpenCode atualizado", running: "Atualizando" },
}

/** Evento em `private-app` quando o serviço/operação muda. Payload: `{ status }`. */
export const OPENCODE_SERVICE_UPDATED_EVENT = "opencode-service-updated"
export const OPENCODE_SERVICE_AUDIT_ENTITY = "ServicoOpenCode"

/** Pacote npm do OpenCode (versão disponível). */
export const OPENCODE_NPM_PACKAGE = "@opencode/cli"
/** Major suportada pelo Opex (`@opencode/client` 2.x). */
export const OPENCODE_SUPPORTED_MAJOR = 2

export const OPENCODE_LOG_LINES_DEFAULT = 200
export const OPENCODE_LOG_LINES_MAX = 300

/** Tempo máximo de cada ação por SSH. */
export const SERVICE_ACTION_TIMEOUT_MS: Record<OpencodeServiceAction, number> = { start: 60_000, stop: 60_000, restart: 90_000, upgrade: 10 * 60_000 }
/** Depois de iniciar/reiniciar, espera a API responder no máximo isto. */
export const SERVICE_READY_TIMEOUT_MS = 45_000
