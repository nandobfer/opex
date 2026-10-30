import { integrationDebug } from "@/lib/integrations/debug"
import { loggerFor } from "@/lib/logger"
import { centralLogScope } from "../constants"

/**
 * Logs de uma central: vão para o terminal da página da central (integração "Inteligência Artificial",
 * sempre gravados, com `data.scope` da central) e para o Pino.
 */

const dbg = integrationDebug("ai", { always: true })
const pino = loggerFor({ module: "agentic" })

type Data = Record<string, unknown>

export interface CentralLogger {
    info(message: string, data?: Data): void
    step(message: string, data?: Data): void
    success(message: string, data?: Data): void
    warn(message: string, data?: Data): void
    error(message: string, error?: unknown, data?: Data): void
}

export function centralLogger(centralId: string, prefix?: string): CentralLogger {
    const scope = centralLogScope(centralId)
    const text = (message: string) => `[Dev agêntico]${prefix ? ` ${prefix}` : ""} ${message}`
    return {
        info: (message, data) => dbg.info(text(message), { scope, ...data }),
        step: (message, data) => dbg.step(text(message), { scope, ...data }),
        success: (message, data) => dbg.success(text(message), { scope, ...data }),
        warn: (message, data) => {
            dbg.warn(text(message), { scope, ...data })
            pino.warn({ centralId, ...data }, text(message))
        },
        error: (message, error, data) => {
            const detail = error === undefined ? undefined : error instanceof Error ? error.message : String(error)
            dbg.error(text(message), undefined, { scope, ...data, ...(detail ? { error: detail } : {}) })
            pino.error({ err: error, centralId, ...data }, text(message))
        },
    }
}
