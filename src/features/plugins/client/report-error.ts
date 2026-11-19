"use client"

import type { PluginRuntimeEntry } from "../types"
import type { PluginSource } from "./PluginSourceContext"

/** Erros já enviados nesta aba (revisão + onde + mensagem): o mesmo erro vai ao debug uma vez só. */
const reported = new Set<string>()

/**
 * Envia ao debug do plugin (OPE-172) o erro que a fronteira pegou no navegador: falha ao carregar o
 * módulo ou ao renderizar. Nunca lança: sem rede, o erro continua só na tela.
 */
export function reportPluginClientError(source: PluginSource, entry: Pick<PluginRuntimeEntry, "id" | "revision" | "channel">, error: unknown, where: string): void {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 4096) || "Erro desconhecido"
    const key = `${source.kind}|${source.clientId ?? ""}|${entry.id}|${entry.revision}|${where}|${message}`
    if (reported.has(key)) return
    reported.add(key)
    const stack = error instanceof Error && error.stack ? error.stack.slice(0, 8192) : null
    try {
        void Promise.resolve(source.api.post(`${source.base}/${entry.id}/logs`, { message, stack, channel: entry.channel, where })).catch(() => undefined)
    } catch {
        // Sem cliente HTTP utilizável: o erro continua só na tela.
    }
}

/** Só para testes. */
export function resetReportedPluginErrors(): void {
    reported.clear()
}
