/**
 * Escopo do Agente Opex (módulo PURO): o dono (app interno) ou o portal do cliente. O escopo decide
 * as sessões visíveis, o canal de tempo real, as abas guardadas no navegador e o catálogo de
 * ferramentas; no servidor ele carrega o ator do portal (`ClientActor`), sempre conferido no banco.
 */

import { OPEX_CHANNEL_PREFIX } from "@/lib/pusher/channel-names"
import { OPEX_TABS_STORAGE_KEY } from "./constants"

export interface ParsedOpexChannel {
    clientId: string
    userId: string
}

/**
 * `private-opex-{clientId}-{userId}`: o id do cliente é um ObjectId (sem hífen) e o do usuário vem
 * depois do primeiro hífen (o dono usa `local`).
 */
export function parseOpexClientChannel(channel: string): ParsedOpexChannel | null {
    if (!channel.startsWith(OPEX_CHANNEL_PREFIX)) return null
    const value = channel.slice(OPEX_CHANNEL_PREFIX.length)
    const separator = value.indexOf("-")
    if (separator <= 0 || separator === value.length - 1) return null
    return { clientId: value.slice(0, separator), userId: value.slice(separator + 1) }
}

/** Abas abertas: separadas por cliente e usuário; o dono usa a chave original. */
export function opexTabsStorageKey(clientId: string | null, userId: string | null): string {
    return clientId && userId ? `${OPEX_TABS_STORAGE_KEY}:${clientId}:${userId}` : OPEX_TABS_STORAGE_KEY
}
