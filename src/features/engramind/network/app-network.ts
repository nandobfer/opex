import type { NetworkLink, SubscriptionMode } from "./types"

/**
 * Visão inicial Apps x canais (OPE-129, puro): os links por agente agregados por app e o corte dos
 * canais vazios. Decisão do dono no plano aprovado: as duas redes (Apps x canais e Agentes x canais)
 * escondem o canal **sem nenhuma memória**; inativas contam (só some com zero de qualquer status).
 * Os universos, o filtro Canal, o painel do canal e o Importar continuam com todos os canais.
 */

/** Só os canais com ao menos uma memória (de qualquer status), na ordem recebida. */
export function channelsWithMemories<T extends { slug: string }>(channels: readonly T[], memories: readonly { channel: string }[]): T[] {
    const used = new Set(memories.map((memory) => memory.channel))
    return channels.filter((channel) => used.has(channel.slug))
}

/** App de um agente (`app/agente` → `app`). */
export const appOfAgent = (agent: string): string => agent.split("/")[0] ?? agent

/** Id da aresta app → canal na visão de apps. */
export const appLinkEdgeId = (app: string, channel: string) => `app:${app}→${channel}`

/** Link app → canal: as assinaturas de todos os agentes do app naquele canal. */
export interface AppLink {
    id: string
    app: string
    channel: string
    /** Modos das assinaturas, sem repetição (ordem de chegada). */
    modes: SubscriptionMode[]
    /** Agentes (`app/agente`) que assinam o canal, sem repetição. */
    agents: string[]
}

/** Um link por par (app, canal), na ordem em que o par aparece pela primeira vez. */
export function appLinks(links: readonly NetworkLink[]): AppLink[] {
    const byKey = new Map<string, AppLink>()
    for (const link of links) {
        const app = appOfAgent(link.agent)
        const id = appLinkEdgeId(app, link.channel)
        const current = byKey.get(id) ?? { id, app, channel: link.channel, modes: [], agents: [] }
        if (!current.modes.includes(link.mode)) current.modes.push(link.mode)
        if (!current.agents.includes(link.agent)) current.agents.push(link.agent)
        byKey.set(id, current)
    }
    return [...byKey.values()]
}

/** Canais assinados por algum agente do app (sem repetição, na ordem dos links). */
export function appChannels(app: string, links: readonly NetworkLink[]): string[] {
    return [...new Set(links.filter((link) => appOfAgent(link.agent) === app).map((link) => link.channel))]
}

/** Alcance do app: soma das memórias (ativas) dos canais que os agentes dele assinam, cada canal uma vez. */
export function appReach(links: readonly AppLink[], countByChannel: ReadonlyMap<string, number>): Map<string, number> {
    const reach = new Map<string, number>()
    for (const link of links) reach.set(link.app, (reach.get(link.app) ?? 0) + (countByChannel.get(link.channel) ?? 0))
    return reach
}
