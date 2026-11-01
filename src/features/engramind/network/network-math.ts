import type { MemoryStatus, MemoryUsageMap, NetworkChannel, NetworkLink, NetworkMemory, SubscriptionMode } from "./types"

/**
 * Cálculos puros da rede "universo de partículas" do Engramind (OPE-109): cor por idade, tamanho por
 * uso, brilho pelo prazo do consolidador, cor estável dos canais, links das assinaturas e layout.
 * Cores só por tokens do tema (`color-mix` sobre variáveis CSS), nunca valores fixos.
 */

const DAY_MS = 24 * 3600 * 1000
export const PARTICLE_MIN_PX = 10
export const PARTICLE_MAX_PX = 34
/** Fixada nunca some: brilho mínimo visível. */
export const PINNED_MIN_BRIGHTNESS = 0.25
/** Padrão do Engramind para `consolidation.stale_after_days` (quando a configuração não vem). */
export const DEFAULT_STALE_AFTER_DAYS = 90

const time = (iso: string | null | undefined): number => {
    if (!iso) return Number.NaN
    return new Date(iso).getTime()
}

/** "Agente Opex" → "Opex" (os nodes mostram o nome sem o prefixo). */
export function agentDisplayName(name: string): string {
    const stripped = name.replace(/^\s*agente\s+/i, "").trim()
    return stripped || name.trim()
}

/** Relevância: consultas + injeções somadas. */
export const memoryUses = (memory: Pick<NetworkMemory, "retrievals" | "injections">): number => Math.max(0, memory.retrievals) + Math.max(0, memory.injections)

/**
 * Último uso: o maior entre a última busca, o consumo registrado pelo Opex e a criação. A verificação
 * do consolidador (`verified_at`) não é consumo e não conta.
 */
export function lastUseOf(memory: Pick<NetworkMemory, "id" | "lastRetrievedAt" | "createdAt">, usage?: MemoryUsageMap): string {
    const candidates = [memory.lastRetrievedAt, usage?.[memory.id]?.lastUsedAt ?? null, memory.createdAt].filter((value): value is string => Boolean(value) && !Number.isNaN(time(value)))
    return candidates.reduce((best, value) => (time(value) > time(best) ? value : best), memory.createdAt)
}

/** Data de uso real (sem cair na criação): `null` = "nunca usada". */
export function lastRealUseOf(memory: Pick<NetworkMemory, "id" | "lastRetrievedAt">, usage?: MemoryUsageMap): string | null {
    const candidates = [memory.lastRetrievedAt, usage?.[memory.id]?.lastUsedAt ?? null].filter((value): value is string => Boolean(value) && !Number.isNaN(time(value)))
    if (!candidates.length) return null
    return candidates.reduce((best, value) => (time(value) > time(best) ? value : best))
}

/** Idade relativa ao universo: 0 = a mais nova (verde), 1 = a mais antiga (roxo). Uma só ou datas iguais → 0. */
export function ageRatios(memories: readonly Pick<NetworkMemory, "id" | "createdAt">[]): Map<string, number> {
    const times = memories.map((memory) => time(memory.createdAt)).filter((value) => !Number.isNaN(value))
    const newest = Math.max(...times)
    const oldest = Math.min(...times)
    const span = newest - oldest
    return new Map(memories.map((memory) => [memory.id, span > 0 && !Number.isNaN(time(memory.createdAt)) ? (newest - time(memory.createdAt)) / span : 0]))
}

/** Cor pela idade (gradiente verde → roxo primário). */
export function ageColor(ratio: number): string {
    const pct = Math.round(clamp01(ratio) * 100)
    return `color-mix(in oklch, var(--color-primary) ${pct}%, var(--color-success))`
}

/** Tamanho pela soma de consultas e injeções, em escala logarítmica suave relativa ao universo. */
export function particleSize(uses: number, maxUses: number): number {
    if (maxUses <= 0 || uses <= 0) return PARTICLE_MIN_PX
    const ratio = Math.log1p(uses) / Math.log1p(maxUses)
    return Math.round((PARTICLE_MIN_PX + (PARTICLE_MAX_PX - PARTICLE_MIN_PX) * clamp01(ratio)) * 10) / 10
}

/**
 * Brilho de 1 (usada agora) a 0 (cinza), linear até o prazo `stale_after_days` do consolidador.
 * Candidata a esquecimento → 0; inativa → 0; fixada nunca fica abaixo do mínimo visível.
 */
export function particleBrightness(input: { status: MemoryStatus; stale: boolean; lastUse: string }, staleAfterDays: number, now: number = Date.now()): number {
    if (input.status === "archived") return 0
    const days = Math.max(0, (now - time(input.lastUse)) / DAY_MS)
    const limit = staleAfterDays > 0 ? staleAfterDays : DEFAULT_STALE_AFTER_DAYS
    let value = Number.isNaN(days) ? 0 : clamp01(1 - days / limit)
    if (input.stale) value = 0
    if (input.status === "permanent") value = Math.max(value, PINNED_MIN_BRIGHTNESS)
    return Math.round(value * 1000) / 1000
}

/** Cor final da partícula: a cor da idade apagada em direção ao cinza conforme perde brilho. */
export function particleColor(base: string, brightness: number): string {
    const pct = Math.round(clamp01(brightness) * 100)
    return `color-mix(in oklch, ${base} ${pct}%, var(--color-muted-foreground))`
}

const CHART_TOKENS = 6
const TONES = ["", "var(--color-foreground)", "var(--color-background)"] as const

export function stableHash(text: string): number {
    let hash = 2166136261
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
}

const toneOf = (base: number, tone: number): string => {
    const token = `var(--chart-${base + 1})`
    if (tone === 0) return token
    return `color-mix(in oklch, ${token} 70%, ${TONES[tone % TONES.length] || TONES[1]})`
}

/**
 * Cor de cada canal: a cor base (`--chart-1..6`) vem só do slug (o mesmo canal tem sempre a mesma
 * cor). Quando mais de um canal cai na mesma base, os seguintes (em ordem de slug) ganham variações de
 * tom da mesma cor.
 */
export function channelColors(slugs: readonly string[]): Map<string, string> {
    const byBase = new Map<number, string[]>()
    for (const slug of [...new Set(slugs)].sort()) {
        const base = stableHash(slug) % CHART_TOKENS
        byBase.set(base, [...(byBase.get(base) ?? []), slug])
    }
    const colors = new Map<string, string>()
    for (const [base, group] of byBase) group.forEach((slug, index) => colors.set(slug, toneOf(base, index)))
    return colors
}

/** Só as cores dos canais de um universo, a partir do mapa de TODOS os canais (a cor não muda entre universos). */
export function pickChannelColors(all: ReadonlyMap<string, string>, slugs: readonly string[]): Map<string, string> {
    const picked = new Map<string, string>()
    for (const slug of slugs) {
        const color = all.get(slug) ?? channelColors([slug]).get(slug)
        if (color) picked.set(slug, color)
    }
    return picked
}

/** O alvo da assinatura (exato ou prefixo `eng/projeto-*`) alcança o canal? */
export function subscriptionReaches(target: string, isPrefix: boolean, slug: string): boolean {
    if (!isPrefix && !target.endsWith("*")) return target === slug
    const base = target.endsWith("*") ? target.slice(0, -1) : target
    return base.length > 0 && slug.startsWith(base)
}

export interface SubscriptionInput {
    id: string
    agent: string
    target: string
    isPrefix: boolean
    mode: SubscriptionMode
    /** Canais ativos que o alvo alcança (`reaches` do Engramind). */
    reaches: readonly string[]
}

/**
 * Um link por canal casado em cada assinatura: os ativos pelo `reaches` do Engramind e, com
 * "Mostrar arquivados", os arquivados casados localmente. Só canais visíveis; prefixo sem canal não gera link.
 */
export function subscriptionLinks(subscriptions: readonly SubscriptionInput[], channels: readonly NetworkChannel[], includeArchived: boolean): NetworkLink[] {
    const visible = new Map(channels.filter((channel) => includeArchived || !channel.archived).map((channel) => [channel.slug, channel]))
    const links: NetworkLink[] = []
    const seen = new Set<string>()
    for (const subscription of subscriptions) {
        const reached = new Set(subscription.reaches)
        if (includeArchived) for (const channel of visible.values()) if (channel.archived && subscriptionReaches(subscription.target, subscription.isPrefix, channel.slug)) reached.add(channel.slug)
        for (const slug of reached) {
            if (!visible.has(slug)) continue
            const id = `${subscription.agent}→${slug}`
            if (seen.has(id)) continue
            seen.add(id)
            links.push({ id, agent: subscription.agent, channel: slug, mode: subscription.mode })
        }
    }
    return links
}

export interface Point {
    x: number
    y: number
}

export interface Rect {
    x: number
    y: number
    width: number
    height: number
}

/** Distância vertical entre a linha de agentes (em cima) e a de canais (embaixo). */
export const OVERVIEW_ROW_GAP = 320
/** Passo horizontal entre agentes (pílula de até ~180 px). */
export const OVERVIEW_AGENT_GAP = 210
/** Passo horizontal entre canais (card de até 240 px, `max-w-60`). */
export const OVERVIEW_CHANNEL_GAP = 270
/** Caixa aproximada dos nodes, para o enquadramento inicial. */
export const OVERVIEW_AGENT_BOX = { width: 180, height: 48 }
export const OVERVIEW_CHANNEL_BOX = { width: 240, height: 52 }
/** Folga do enquadramento inicial em cada lado da linha de agentes (fração da largura). */
export const OVERVIEW_FIT_MARGIN = 0.15

/**
 * Visão inicial na horizontal: os agentes numa linha em cima (agrupados por app) e os canais numa
 * linha embaixo, as duas centralizadas em x = 0.
 */
export function layoutOverview(agents: readonly { id: string; app: string }[], channels: readonly { slug: string }[]): { agents: Map<string, Point>; channels: Map<string, Point> } {
    const sortedAgents = [...agents].sort((a, b) => a.app.localeCompare(b.app) || a.id.localeCompare(b.id))
    const sortedChannels = [...channels].sort((a, b) => a.slug.localeCompare(b.slug))
    const row = (count: number, index: number, gap: number) => (index - (count - 1) / 2) * gap
    return {
        agents: new Map(sortedAgents.map((agent, index) => [agent.id, { x: row(sortedAgents.length, index, OVERVIEW_AGENT_GAP), y: 0 }])),
        channels: new Map(sortedChannels.map((channel, index) => [channel.slug, { x: row(sortedChannels.length, index, OVERVIEW_CHANNEL_GAP), y: OVERVIEW_ROW_GAP }])),
    }
}

/**
 * Enquadramento inicial da visão horizontal: a largura da linha de agentes com uma folga de
 * `OVERVIEW_FIT_MARGIN` de cada lado e a altura dos agentes até a linha de canais (os links ficam
 * visíveis; canais além da largura dos agentes ficam fora, a um arrastar). Sem agentes: `null`
 * (enquadra tudo).
 */
export function overviewInitialBounds(agents: readonly Point[]): Rect | null {
    if (!agents.length) return null
    const xs = agents.map((point) => point.x)
    const left = Math.min(...xs) - OVERVIEW_AGENT_BOX.width / 2
    const right = Math.max(...xs) + OVERVIEW_AGENT_BOX.width / 2
    const margin = (right - left) * OVERVIEW_FIT_MARGIN
    const top = -OVERVIEW_AGENT_BOX.height / 2 - margin / 4
    const bottom = OVERVIEW_ROW_GAP + OVERVIEW_CHANNEL_BOX.height / 2 + margin / 4
    return { x: left - margin, y: top, width: right - left + margin * 2, height: bottom - top }
}

/**
 * Posição (canto superior esquerdo, em px da tela) do card que substitui a partícula: centralizado
 * sobre ela e empurrado para dentro do canvas, com `margin` de folga em todas as bordas.
 */
export function clampCardRect(anchor: Point, card: { width: number; height: number }, canvas: { width: number; height: number }, margin = 8): Point {
    const axis = (center: number, size: number, limit: number) => {
        const max = limit - size - margin
        if (max < margin) return margin
        return Math.min(Math.max(center - size / 2, margin), max)
    }
    return { x: axis(anchor.x, card.width, canvas.width), y: axis(anchor.y, card.height, canvas.height) }
}

export const UNIVERSE_FIRST_RADIUS = 150
export const UNIVERSE_RING_GAP = 58
export const UNIVERSE_SLOT = 46

/** Universo: órbitas concêntricas em volta do centro (0,0); as mais usadas ficam nas órbitas internas. */
export function layoutUniverse(memories: readonly Pick<NetworkMemory, "id" | "retrievals" | "injections">[]): Map<string, Point> {
    const sorted = [...memories].sort((a, b) => memoryUses(b) - memoryUses(a) || a.id.localeCompare(b.id))
    const positions = new Map<string, Point>()
    let ring = 0
    let cursor = 0
    while (cursor < sorted.length) {
        const radius = UNIVERSE_FIRST_RADIUS + ring * UNIVERSE_RING_GAP
        const capacity = Math.max(6, Math.floor((2 * Math.PI * radius) / UNIVERSE_SLOT))
        const members = sorted.slice(cursor, cursor + capacity)
        const offset = ring * 0.61
        members.forEach((memory, index) => {
            const angle = offset + (index / members.length) * 2 * Math.PI
            positions.set(memory.id, { x: Math.round(Math.cos(angle) * radius * 10) / 10, y: Math.round(Math.sin(angle) * radius * 10) / 10 })
        })
        cursor += members.length
        ring += 1
    }
    return positions
}

/** Deslocamento do hover: as demais partículas se afastam levemente da focada. */
export function repelOffset(from: Point, focus: Point, strength = 18, radius = 220): Point {
    const dx = from.x - focus.x
    const dy = from.y - focus.y
    const distance = Math.hypot(dx, dy)
    if (distance === 0 || distance > radius) return { x: 0, y: 0 }
    const factor = (strength * (1 - distance / radius)) / distance
    return { x: dx * factor, y: dy * factor }
}

export interface MemoryFilters {
    channel?: string
    status?: string
    category?: string
    author?: string
    /** Dia (`yyyy-mm-dd`): só as alteradas desde então. */
    since?: string
}

export const hasActiveFilters = (filters: MemoryFilters, searchIds: ReadonlySet<string> | null): boolean => Boolean(searchIds || filters.channel || filters.status || filters.category || filters.author?.trim() || filters.since)

/** A memória casa com a busca e os filtros? (Destaque: as demais ficam apagadas, nada sai do universo.) */
export function matchesFilters(memory: NetworkMemory, filters: MemoryFilters, searchIds: ReadonlySet<string> | null): boolean {
    if (searchIds && !searchIds.has(memory.id)) return false
    if (filters.channel && memory.channel !== filters.channel) return false
    if (filters.status && memory.status !== filters.status) return false
    if (filters.category && memory.category !== filters.category) return false
    const author = filters.author?.trim().toLowerCase()
    if (author && !(memory.author ?? "").toLowerCase().includes(author)) return false
    if (filters.since && time(memory.updatedAt) < time(`${filters.since}T00:00:00`)) return false
    return true
}

export interface UniverseStats {
    active: number
    inactive: number
    pinned: number
    uses: number
    lastUse: string | null
    forgotten: number
    byChannel: { slug: string; count: number }[]
}

/** Números do card de estatísticas de um universo (canal ou agente). */
export function universeStats(memories: readonly NetworkMemory[], brightness: ReadonlyMap<string, number>, usage?: MemoryUsageMap): UniverseStats {
    const byChannel = new Map<string, number>()
    let lastUse: string | null = null
    for (const memory of memories) {
        byChannel.set(memory.channel, (byChannel.get(memory.channel) ?? 0) + 1)
        const used = lastRealUseOf(memory, usage)
        if (used && (!lastUse || time(used) > time(lastUse))) lastUse = used
    }
    return {
        active: memories.filter((memory) => memory.status !== "archived").length,
        inactive: memories.filter((memory) => memory.status === "archived").length,
        pinned: memories.filter((memory) => memory.status === "permanent").length,
        uses: memories.reduce((sum, memory) => sum + memoryUses(memory), 0),
        lastUse,
        forgotten: memories.filter((memory) => memory.status !== "archived" && (brightness.get(memory.id) ?? 1) === 0).length,
        byChannel: [...byChannel].map(([slug, count]) => ({ slug, count })).sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug)),
    }
}

/** Alcance de cada agente: memórias somadas dos canais ligados a ele. */
export function agentReach(links: readonly NetworkLink[], countByChannel: ReadonlyMap<string, number>): Map<string, number> {
    const reach = new Map<string, number>()
    for (const link of links) reach.set(link.agent, (reach.get(link.agent) ?? 0) + (countByChannel.get(link.channel) ?? 0))
    return reach
}

function clamp01(value: number): number {
    if (Number.isNaN(value)) return 0
    return Math.min(1, Math.max(0, value))
}
