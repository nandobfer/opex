/**
 * Rótulos dos canais por central do agente desenvolvedor (específico do Opex, OPE-116): a lib
 * `@engramind/client` recebe o mapa pronto (`channelLabels` do provider) e mostra a sigla no lugar do id.
 */
import { scopedChannelPrefix, type ChannelNamespace } from "@/features/ai/agents"
import { conversationIdOfJid } from "@/features/secretary-agent/conversation-id"
import type { ChannelLabel } from "@engramind/client/react"

/** Prefixo (real) dos canais por central do agente desenvolvedor (`<app>/agentes/desenvolvedor/central/`, OPE-206). */
export const centralChannelPrefix = (ns: ChannelNamespace) => scopedChannelPrefix("developer-central", ns)

export const isCentralChannel = (slug: string, ns: ChannelNamespace) => {
    const prefix = centralChannelPrefix(ns)
    return slug.startsWith(prefix) && slug.length > prefix.length
}

/**
 * Rótulos dos canais por central: o título é a sigla do repositório (ex.: `OPE`) e a dica, o nome do
 * repositório. Sem sigla, o nome do produto; central desconhecida fica de fora (o título volta a ser
 * a ponta do slug).
 */
export function centralChannelLabels(centrals: readonly { id: string; sigla?: string | null; projectName?: string | null; repo?: string | null }[], ns: ChannelNamespace): Map<string, ChannelLabel> {
    const labels = new Map<string, ChannelLabel>()
    const prefix = centralChannelPrefix(ns)
    for (const central of centrals) {
        const name = central.projectName?.trim() || central.repo?.trim() || ""
        const title = central.sigla?.trim() || name
        if (!title) continue
        const hint = [name || title, central.repo && central.repo !== name ? central.repo : null].filter(Boolean).join(" · ")
        labels.set(`${prefix}${central.id}`, { title, hint })
    }
    return labels
}

/** Prefixos (reais) dos canais por cliente do Agente Opex e do Agente Maddox (`…/clientes/<clientId>`). */
export const clientChannelPrefixes = (ns: ChannelNamespace) => [scopedChannelPrefix("opex-client-specific", ns), scopedChannelPrefix("maddox-client-specific", ns)] as const

/**
 * Rótulos dos canais por cliente (OPE-148): no universo único do Agente Opex e do Maddox, cada canal de
 * cliente aparece com o nome do cliente (a dica diz de qual agente é). Cliente desconhecido fica de fora.
 */
export function clientChannelLabels(clients: readonly { id: string; name?: string | null }[], ns: ChannelNamespace): Map<string, ChannelLabel> {
    const labels = new Map<string, ChannelLabel>()
    const [opexPrefix, maddoxPrefix] = clientChannelPrefixes(ns)
    for (const client of clients) {
        const title = client.name?.trim()
        if (!title) continue
        labels.set(`${opexPrefix}${client.id}`, { title, hint: `Memórias do cliente ${title} · Agente Opex` })
        labels.set(`${maddoxPrefix}${client.id}`, { title, hint: `Memórias do cliente ${title} · Agente Maddox` })
    }
    return labels
}

/** Prefixo (real) dos canais por conversa do Agente Secretário (`<app>/agentes/secretario/conversas/<id>`, OPE-192). */
export const secretaryConversationPrefix = (ns: ChannelNamespace) => scopedChannelPrefix("secretary-conversation", ns)

/**
 * Rótulos dos canais por conversa do Agente Secretário (OPE-192): o título é o nome do contato ou grupo e a
 * dica, o número (a lib não mostra foto no rótulo; a foto fica na aba Conversas e nos seletores).
 */
export function secretaryChannelLabels(contacts: readonly { jid: string; name: string; number: string | null; isGroup: boolean }[], ns: ChannelNamespace): Map<string, ChannelLabel> {
    const labels = new Map<string, ChannelLabel>()
    const prefix = secretaryConversationPrefix(ns)
    for (const contact of contacts) {
        const id = conversationIdOfJid(contact.jid)
        const title = contact.name.trim()
        if (!id || !title) continue
        labels.set(`${prefix}${id}`, { title, hint: contact.isGroup ? `Grupo · Agente Secretário` : `+${contact.number ?? ""} · Agente Secretário` })
    }
    return labels
}

export type { ChannelLabel }
