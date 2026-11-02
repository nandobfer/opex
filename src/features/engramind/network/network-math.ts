import type { MemoryStatus, MemoryUsageMap, NetworkChannel, NetworkLink, NetworkMemory, SubscriptionMode } from "./types"

/**
 * Cálculos puros da rede "universo de partículas" do Engramind (OPE-109, OPE-114): cor pelo canal,
 * distância do centro pela idade, tamanho pelo uso, brilho pelo prazo do consolidador, cor estável dos
 * canais, links das assinaturas e layout.
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

/** Cor final da partícula: a cor do canal apagada em direção ao cinza conforme perde brilho. */
export function particleColor(base: string, brightness: number): string {
    const pct = Math.round(clamp01(brightness) * 100)
    return `color-mix(in oklch, ${base} ${pct}%, var(--color-muted-foreground))`
}

/** Paleta dos canais: `--chart-2..6` (o `--chart-1` é o roxo primário, reservado ao canal em destaque). */
const CHANNEL_TOKENS = 5
/** Cor do canal com mais memórias do universo (e de todo universo de um canal só). */
export const PRIMARY_CHANNEL_COLOR = "var(--color-primary)"
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
    const token = `var(--chart-${base + 2})`
    if (tone === 0) return token
    return `color-mix(in oklch, ${token} 70%, ${TONES[tone % TONES.length] || TONES[1]})`
}

/**
 * Cor de cada canal: a cor base (`--chart-2..6`) vem só do slug (o mesmo canal tem sempre a mesma
 * cor). Quando mais de um canal cai na mesma base, os seguintes (em ordem de slug) ganham variações de
 * tom da mesma cor.
 */
export function channelColors(slugs: readonly string[]): Map<string, string> {
    const byBase = new Map<number, string[]>()
    for (const slug of [...new Set(slugs)].sort()) {
        const base = stableHash(slug) % CHANNEL_TOKENS
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

/**
 * Cores de um universo: cada canal com a sua cor estável (do mapa `base` ou do slug) e o canal com mais
 * memórias (todas, inclusive inativas; empate pelo slug, a ordem da legenda "Por canal") com o roxo
 * primário. Canais do mapa sem memórias entram com a cor estável. Sem memórias, nenhum fica roxo.
 */
export function universeChannelColors(base: ReadonlyMap<string, string> | undefined, memories: readonly Pick<NetworkMemory, "channel">[]): Map<string, string> {
    const counts = new Map<string, number>()
    for (const memory of memories) counts.set(memory.channel, (counts.get(memory.channel) ?? 0) + 1)
    const slugs = [...new Set([...(base?.keys() ?? []), ...counts.keys()])]
    const colors = new Map<string, string>()
    for (const slug of slugs) {
        const color = base?.get(slug) ?? channelColors([slug]).get(slug)
        if (color) colors.set(slug, color)
    }
    const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    if (top) colors.set(top[0], PRIMARY_CHANNEL_COLOR)
    return colors
}

/**
 * Nome do canal em duas partes: o prefixo até a última `/` (linha discreta) e a ponta final (o
 * título destacado). Canais com o mesmo começo (`agentes/desenvolvedor/…`) passam a se distinguir.
 */
export function splitChannelSlug(slug: string): { prefix: string; leaf: string } {
    const trimmed = slug.replace(/\/+$/, "")
    const cut = trimmed.lastIndexOf("/")
    if (cut <= 0) return { prefix: "", leaf: trimmed || slug }
    return { prefix: trimmed.slice(0, cut + 1), leaf: trimmed.slice(cut + 1) }
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

/** Zoom mínimo do enquadramento inicial no celular: os nomes continuam legíveis. */
export const MOBILE_FIT_MIN_ZOOM = 0.5

/**
 * Enquadramento com zoom mínimo (celular): se caber o retângulo inteiro com zoom ≥ `minZoom`, devolve
 * `null` (enquadra normalmente); senão, centraliza no meio do retângulo com `minZoom` (o resto fica a
 * um arrastar). Sem tamanho medido do quadro, `null`.
 */
export function minZoomCenter(bounds: Rect, size: { width: number; height: number }, minZoom: number): { x: number; y: number; zoom: number } | null {
    if (size.width <= 0 || size.height <= 0 || bounds.width <= 0 || bounds.height <= 0) return null
    const fit = Math.min(size.width / bounds.width, size.height / bounds.height)
    if (fit >= minZoom) return null
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, zoom: minZoom }
}

/**
 * Tamanho visível do card da memória: o natural (largura fixa, altura do conteúdo) limitado ao quadro
 * menos `margin` de cada lado. Sem quadro medido, o natural.
 */
export function memoryCardSize(natural: { width: number; height: number }, canvas: { width: number; height: number }, margin = 8): { width: number; height: number } {
    const width = canvas.width > 0 ? Math.min(natural.width, Math.max(canvas.width - margin * 2, 160)) : natural.width
    const height = canvas.height > 0 ? Math.min(natural.height, Math.max(canvas.height - margin * 2, 120)) : natural.height
    return { width, height }
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

/** Criação em ms; data inválida conta como a mais antiga. */
const createdTime = (memory: Pick<NetworkMemory, "createdAt">): number => {
    const value = time(memory.createdAt)
    return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value
}

/**
 * Universo: órbitas concêntricas em volta do centro (0,0) pela idade (criação): as mais novas nas
 * órbitas internas, as mais antigas (e as de data inválida) nas externas.
 */
export function layoutUniverse(memories: readonly Pick<NetworkMemory, "id" | "createdAt">[]): Map<string, Point> {
    const sorted = [...memories].sort((a, b) => {
        const diff = createdTime(b) - createdTime(a)
        return (Number.isNaN(diff) ? 0 : diff) || a.id.localeCompare(b.id)
    })
    const positions = new Map<string, Point>()
    let cursor = 0
    universeRingCounts(sorted.length).forEach((count, ring) => {
        const radius = UNIVERSE_FIRST_RADIUS + ring * UNIVERSE_RING_GAP
        const members = sorted.slice(cursor, cursor + count)
        const offset = ring * 0.61
        members.forEach((memory, index) => {
            const angle = offset + (index / members.length) * 2 * Math.PI
            positions.set(memory.id, { x: Math.round(Math.cos(angle) * radius * 10) / 10, y: Math.round(Math.sin(angle) * radius * 10) / 10 })
        })
        cursor += count
    })
    return positions
}

/** Vagas de um anel (≈ `UNIVERSE_SLOT` px entre vizinhas). */
export const universeRingCapacity = (ring: number) => Math.max(6, Math.floor((2 * Math.PI * (UNIVERSE_FIRST_RADIUS + ring * UNIVERSE_RING_GAP)) / UNIVERSE_SLOT))

/**
 * Quantas memórias em cada anel: o número de anéis é o mínimo que comporta todas, e elas são
 * distribuídas proporcionalmente às vagas de cada anel (maior resto), para o último anel não ficar
 * quase vazio (50 memórias: ~12/17/21 em vez de 20/28/2).
 */
export function universeRingCounts(total: number): number[] {
    if (total <= 0) return []
    const capacities: number[] = []
    let room = 0
    while (room < total) {
        const capacity = universeRingCapacity(capacities.length)
        capacities.push(capacity)
        room += capacity
    }
    const exact = capacities.map((capacity) => (total * capacity) / room)
    const counts = exact.map((value, ring) => Math.min(Math.floor(value), capacities[ring] ?? 0))
    let missing = total - counts.reduce((sum, count) => sum + count, 0)
    const byRemainder = exact.map((value, ring) => ({ ring, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.ring - b.ring)
    for (let index = 0; missing > 0; index = (index + 1) % byRemainder.length) {
        const ring = byRemainder[index]?.ring ?? 0
        if ((counts[ring] ?? 0) < (capacities[ring] ?? 0)) {
            counts[ring] = (counts[ring] ?? 0) + 1
            missing -= 1
        }
    }
    return counts
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

/** Cor do link partícula ↔ centro: verde quando o agente do centro escreveu a memória; senão o roxo primário. */
export function orbitLinkTone(memory: Pick<NetworkMemory, "authorAgent">, center: { kind: "channel" | "agent"; id: string }): "primary" | "success" {
    return center.kind === "agent" && Boolean(memory.authorAgent) && memory.authorAgent === center.id ? "success" : "primary"
}

/** Janela em que uma memória nova conta como "acabou de ser criada" (partícula de criação). */
export const AGENT_WRITE_WINDOW_MS = 2 * 60 * 1000

export interface AgentWrite {
    id: string
    agent: string
    channel: string
}

/**
 * Criações por agente entre os ids que acabaram de aparecer: só memórias com agente autor
 * (`authorAgent`) criadas há pouco. Ids que só apareceram agora por outro motivo (Mostrar arquivados,
 * filtro de app, memória movida) não contam.
 */
export function agentWritesOf(fresh: readonly string[], memories: readonly Pick<NetworkMemory, "id" | "authorAgent" | "channel" | "createdAt">[], now: number = Date.now()): AgentWrite[] {
    if (!fresh.length) return []
    const byId = new Map(memories.map((memory) => [memory.id, memory]))
    const writes: AgentWrite[] = []
    for (const id of fresh) {
        const memory = byId.get(id)
        if (!memory?.authorAgent) continue
        const age = now - time(memory.createdAt)
        if (Number.isNaN(age) || age > AGENT_WRITE_WINDOW_MS || age < -AGENT_WRITE_WINDOW_MS) continue
        writes.push({ id, agent: memory.authorAgent, channel: memory.channel })
    }
    return writes
}

/** Pesos da fusão da busca do Engramind (`search.vector_weight`, `search.text_weight`, `search.rrf_k`). */
export interface SearchFusion {
    vectorWeight: number
    textWeight: number
    k: number
}

export const DEFAULT_SEARCH_FUSION: SearchFusion = { vectorWeight: 1, textWeight: 1, k: 60 }

/** Acertos de um ramo sozinho que ainda destacam: as primeiras posições (as mais próximas pelo sentido). */
export const SEARCH_SINGLE_BRANCH_TOP = 3

/**
 * Ids que a busca destaca. O ramo vetorial do Engramind não tem limiar: devolve as memórias mais
 * próximas até o `limit`, mesmo sem relação com o termo, e com poucas memórias elas são todas. No modo
 * `hybrid`, destacam as que os dois ramos encontraram (sentido e texto) e as que um ramo sozinho pôs
 * nas `SEARCH_SINGLE_BRANCH_TOP` primeiras posições: score ≥ `max(peso) / (k + top)`. Como o acerto dos
 * dois ramos vale no mínimo `(pesoV + pesoT) / (k + limit)`, ele sempre passa. No modo `text`, todas.
 */
export function relevantSearchIds(results: readonly { score: number; memory: { id: string } }[], mode: "hybrid" | "text", fusion: SearchFusion = DEFAULT_SEARCH_FUSION): string[] {
    if (mode === "text") return results.map((hit) => hit.memory.id)
    const threshold = Math.max(fusion.vectorWeight, fusion.textWeight) / (fusion.k + SEARCH_SINGLE_BRANCH_TOP)
    return results.filter((hit) => hit.score >= threshold - 1e-6).map((hit) => hit.memory.id)
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
