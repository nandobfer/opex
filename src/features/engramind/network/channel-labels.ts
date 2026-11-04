/**
 * Rótulos dos canais por central do agente desenvolvedor (específico do Opex, OPE-116): a lib
 * `@engramind/client` recebe o mapa pronto (`channelLabels` do provider) e mostra a sigla no lugar do id.
 */
import { AI_AGENTS } from "@/features/ai/agents"
import type { ChannelLabel } from "@engramind/client/react"

/** Prefixo dos canais por central do agente desenvolvedor (`…/central/<centralId>`). */
export const CENTRAL_CHANNEL_PREFIX = `${AI_AGENTS["developer-central"].channel}/`

export const isCentralChannel = (slug: string) => slug.startsWith(CENTRAL_CHANNEL_PREFIX) && slug.length > CENTRAL_CHANNEL_PREFIX.length

/**
 * Rótulos dos canais por central: o título é a sigla do repositório (ex.: `OPE`) e a dica, o nome do
 * repositório. Sem sigla, o nome do produto; central desconhecida fica de fora (o título volta a ser
 * a ponta do slug).
 */
export function centralChannelLabels(centrals: readonly { id: string; sigla?: string | null; projectName?: string | null; repo?: string | null }[]): Map<string, ChannelLabel> {
    const labels = new Map<string, ChannelLabel>()
    for (const central of centrals) {
        const name = central.projectName?.trim() || central.repo?.trim() || ""
        const title = central.sigla?.trim() || name
        if (!title) continue
        const hint = [name || title, central.repo && central.repo !== name ? central.repo : null].filter(Boolean).join(" · ")
        labels.set(`${CENTRAL_CHANNEL_PREFIX}${central.id}`, { title, hint })
    }
    return labels
}

export type { ChannelLabel }
