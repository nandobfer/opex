import { AI_AGENTS } from "@/features/ai/agents"
import { splitChannelSlug } from "./network-math"

/** Título e dica de um canal quando a ponta do slug não é legível (ex.: id da central). */
export interface ChannelLabel {
    /** Texto destacado no lugar da ponta final do slug (ex.: a sigla `OPE`). */
    title: string
    /** Dica ao passar o mouse no título (ex.: o nome do repositório). */
    hint: string
}

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

/** Partes exibidas do nome de um canal: prefixo discreto, título e a dica (quando houver rótulo). */
export function channelNameParts(slug: string, labels?: ReadonlyMap<string, ChannelLabel>): { prefix: string; title: string; hint: string | null } {
    const { prefix, leaf } = splitChannelSlug(slug)
    const label = labels?.get(slug)
    return { prefix, title: label?.title ?? leaf, hint: label?.hint ?? null }
}

/**
 * Slug do canal para exibir numa linha (chips, legendas, trilha, opções de filtro): canal de central com
 * a ponta trocada pela sigla (`agentes/desenvolvedor/central/OPE`); sem rótulo, o slug como está.
 * Helper único (OPE-113): todo lugar que mostra um canal usa este.
 */
export function channelDisplayName(slug: string, labels?: ReadonlyMap<string, ChannelLabel>): string {
    const label = labels?.get(slug)
    if (!label) return slug
    const { prefix } = splitChannelSlug(slug)
    return `${prefix}${label.title}`
}

/** Dica do canal exibido: nome do repositório e o slug inteiro (quando há rótulo); senão o slug. */
export function channelDisplayHint(slug: string, labels?: ReadonlyMap<string, ChannelLabel>): string {
    const label = labels?.get(slug)
    return label ? `${label.hint} · ${slug}` : slug
}
