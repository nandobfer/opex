/**
 * Migração B (OPE-206, módulo PURO): os canais do dono passam dos nomes antigos (`agentes/...`) para os nomes com
 * o app na frente (`opex/agentes/...`). Aqui ficam as decisões sem I/O, usadas pelo executor e pelos testes:
 * - o mapa dos canais (origem → destino) e o inverso (volta atrás);
 * - o destino de cada assinatura (canal exato ou prefixo `x/*`);
 * - a troca de slug guardado no Mongo pelo mapa;
 * - a conferência dos dois exports (antes e depois): mesmos ids, totais, textos e cada memória no canal mapeado.
 */
import { fitsChannelLimits, isManagedLogical, LOGICAL_AGENTS_PREFIX } from "../channel-namespace"

export type MigrationDirection = "forward" | "revert"

/** Resumo de uma memória no export (o texto nunca sai do host: só o SHA-256). */
export interface MemoryDigest {
    id: string
    channel: string
    status: string
    pinned: boolean | null
    key: string | null
    textHash: string
}

/** Resumo do export completo do host (o arquivo inteiro fica no host, no caminho `file`). */
export interface ExportDigest {
    file: string
    source: string | null
    exportedAt: string | null
    totals: { memories: number; byStatus: Record<string, number>; byChannel: Record<string, number> }
    memories: MemoryDigest[]
}

export interface ChannelMapEntry {
    from: string
    to: string
    /** A origem estava arquivada: o destino também é arquivado no fim. */
    wasArchived: boolean
    name: string
    description: string | null
    priority: number | null
}

export interface MappableChannel {
    slug: string
    name: string
    description: string | null
    priority?: number | null
    archived_at: string | null
}

/** Nome novo de um canal gerenciado pelo Opex no app (`agentes/x` → `<app>/agentes/x`; raiz `opex` → `<app>`). */
export function prefixedName(app: string, legacy: string): string | null {
    if (!isManagedLogical(legacy)) return null
    const next = legacy === "opex" ? app : `${app}/${legacy}`
    return fitsChannelLimits(next) ? next : null
}

/**
 * Mapa da ida: os canais gerenciados com nome antigo (a raiz e todo `agentes/**`, inclusive arquivados e órfãos),
 * cada um com o destino. A raiz cujo destino é ela mesma (`opex` no app `opex`) e os que já têm o nome novo ficam de
 * fora. Nome novo além dos limites do Engramind vai para `tooLong` (fica na origem e aparece no relatório).
 */
export function buildChannelMap(channels: readonly MappableChannel[], app: string): { map: ChannelMapEntry[]; tooLong: string[] } {
    const map: ChannelMapEntry[] = []
    const tooLong: string[] = []
    for (const channel of channels) {
        if (!isManagedLogical(channel.slug)) continue
        const to = prefixedName(app, channel.slug)
        if (!to) {
            tooLong.push(channel.slug)
            continue
        }
        if (to === channel.slug) continue
        map.push({ from: channel.slug, to, wasArchived: Boolean(channel.archived_at), name: channel.name, description: channel.description ?? null, priority: channel.priority ?? null })
    }
    // Ordem estável (pais antes dos filhos) para a retomada percorrer o mesmo caminho.
    map.sort((a, b) => a.from.localeCompare(b.from))
    return { map, tooLong }
}

/** Mapa da volta atrás: o mesmo mapa com origem e destino trocados. */
export function invertChannelMap(map: readonly ChannelMapEntry[]): ChannelMapEntry[] {
    return map.map((entry) => ({ ...entry, from: entry.to, to: entry.from }))
}

/**
 * Mapa da volta atrás completo: o mapa da ida invertido mais os canais gerenciados com o nome novo criados depois da
 * ida (central ou rotineiro novos, `<app>/agentes/...`), que voltam para `agentes/...` com o estado de arquivamento
 * atual. Sem eles, as memórias dessas listas ficariam fora dos nomes antigos.
 */
export function buildRevertMap(forward: readonly ChannelMapEntry[], channels: readonly MappableChannel[], app: string): ChannelMapEntry[] {
    const map = invertChannelMap(forward)
    const known = new Set(map.map((entry) => entry.from))
    const prefix = `${app}/${LOGICAL_AGENTS_PREFIX}/`
    for (const channel of channels) {
        if (!channel.slug.startsWith(prefix) || known.has(channel.slug)) continue
        map.push({ from: channel.slug, to: channel.slug.slice(app.length + 1), wasArchived: Boolean(channel.archived_at), name: channel.name, description: channel.description ?? null, priority: channel.priority ?? null })
    }
    map.sort((a, b) => a.from.localeCompare(b.from))
    return map
}

/** Slug guardado trocado pelo mapa (o que não está no mapa volta igual). */
export function remapSlug(slug: string, map: readonly Pick<ChannelMapEntry, "from" | "to">[]): string {
    return map.find((entry) => entry.from === slug)?.to ?? slug
}

/**
 * Alvo novo de uma assinatura: canal exato pelo mapa; prefixo `agentes/...*` → `<app>/agentes/...*` (ida) ou o
 * inverso (volta). `null` = a assinatura não é de um canal gerenciado (fica como está).
 */
export function mapSubscriptionTarget(target: string, direction: MigrationDirection, app: string, map: readonly Pick<ChannelMapEntry, "from" | "to">[]): string | null {
    if (!target.endsWith("*")) {
        const next = map.find((entry) => entry.from === target)?.to
        return next && next !== target ? next : null
    }
    const base = target.slice(0, -1)
    if (direction === "forward") return base.startsWith(`${LOGICAL_AGENTS_PREFIX}/`) ? `${app}/${base}*` : null
    const prefixed = `${app}/${LOGICAL_AGENTS_PREFIX}/`
    return base.startsWith(prefixed) ? `${base.slice(app.length + 1)}*` : null
}

export interface SubscriptionLike {
    id: string
    agent: { id: string; slug: string; qualified_slug?: string }
    target: string
    mode: string
    access: string[] | null
    priority: number | null
}

export interface SubscriptionPlanItem {
    oldId: string
    /** Agente (`app/agente`). */
    agent: string
    app: string
    fromTarget: string
    toTarget: string
    mode: string
    access: string[] | null
    priority: number | null
    /** Agente de outro app (ex.: dndicas, zaturno): também é apontado e aparece no relatório. */
    foreign: boolean
    newId: string | null
    removed: boolean
}

/** Assinaturas a recriar nos alvos novos (deduplicadas por id), com o mesmo modo, acesso e prioridade. */
export function buildSubscriptionPlan(subscriptions: readonly SubscriptionLike[], direction: MigrationDirection, app: string, map: readonly Pick<ChannelMapEntry, "from" | "to">[]): SubscriptionPlanItem[] {
    const seen = new Set<string>()
    const plan: SubscriptionPlanItem[] = []
    for (const subscription of subscriptions) {
        if (seen.has(subscription.id)) continue
        seen.add(subscription.id)
        const toTarget = mapSubscriptionTarget(subscription.target, direction, app, map)
        if (!toTarget) continue
        const agent = subscription.agent.qualified_slug ?? subscription.agent.slug
        const agentApp = agent.includes("/") ? agent.split("/")[0]! : ""
        plan.push({ oldId: subscription.id, agent, app: agentApp, fromTarget: subscription.target, toTarget, mode: subscription.mode, access: subscription.access ?? null, priority: subscription.priority ?? null, foreign: agentApp !== app, newId: null, removed: false })
    }
    return plan
}

export interface DigestConflict {
    id: string
}

export interface DigestComparison {
    ok: boolean
    problems: string[]
    checked: number
}

const PROBLEMS_MAX = 50

const sameCounts = (a: Record<string, number>, b: Record<string, number>) => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].every((key) => (a[key] ?? 0) === (b[key] ?? 0))
}

/**
 * Conferência da migração: o export de depois tem o mesmo conjunto de ids, o mesmo total geral e por status, e cada
 * memória com o mesmo hash do texto, status, fixação e chave, no canal mapeado (as em conflito ficam na origem). Cada
 * canal de origem fica vazio, menos as memórias em conflito.
 */
export function compareDigests(before: ExportDigest, after: ExportDigest, map: readonly Pick<ChannelMapEntry, "from" | "to">[], conflicts: readonly DigestConflict[]): DigestComparison {
    const problems: string[] = []
    const push = (problem: string) => {
        if (problems.length < PROBLEMS_MAX) problems.push(problem)
    }
    const conflicted = new Set(conflicts.map((item) => item.id))
    const afterById = new Map(after.memories.map((memory) => [memory.id, memory]))
    const beforeIds = new Set(before.memories.map((memory) => memory.id))
    if (before.memories.length !== after.memories.length) push(`Total de memórias diferente: ${before.memories.length} antes, ${after.memories.length} depois`)
    if (!sameCounts(statusCounts(before), statusCounts(after))) push(`Totais por status diferentes: antes ${JSON.stringify(statusCounts(before))}, depois ${JSON.stringify(statusCounts(after))}`)
    for (const memory of after.memories) if (!beforeIds.has(memory.id)) push(`Memória nova no export de depois: ${memory.id}`)
    const destination = new Map(map.map((entry) => [entry.from, entry.to]))
    for (const memory of before.memories) {
        const now = afterById.get(memory.id)
        if (!now) {
            push(`Memória sumiu: ${memory.id}`)
            continue
        }
        if (now.textHash !== memory.textHash) push(`Texto alterado: ${memory.id}`)
        if (now.status !== memory.status) push(`Status alterado: ${memory.id} (${memory.status} → ${now.status})`)
        if ((now.pinned ?? null) !== (memory.pinned ?? null)) push(`Fixação alterada: ${memory.id}`)
        if ((now.key ?? null) !== (memory.key ?? null)) push(`Chave alterada: ${memory.id}`)
        const expected = conflicted.has(memory.id) ? memory.channel : (destination.get(memory.channel) ?? memory.channel)
        if (now.channel !== expected) push(`Memória fora do canal mapeado: ${memory.id} em ${now.channel} (esperado ${expected})`)
    }
    const origins = new Set(map.map((entry) => entry.from))
    for (const memory of after.memories) if (origins.has(memory.channel) && !conflicted.has(memory.id)) push(`Canal de origem não ficou vazio: ${memory.channel} (${memory.id})`)
    return { ok: problems.length === 0, problems, checked: before.memories.length }
}

function statusCounts(digest: ExportDigest): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const memory of digest.memories) counts[memory.status] = (counts[memory.status] ?? 0) + 1
    return counts
}

/** Origens que podem ser arquivadas: as sem memória em conflito. */
export function archivableOrigins(map: readonly ChannelMapEntry[], conflictChannels: ReadonlySet<string>): ChannelMapEntry[] {
    return map.filter((entry) => !conflictChannels.has(entry.from))
}

/** Chave de idempotência do `move` de uma memória (a retomada repete a mesma). */
export const moveIdempotencyKey = (migrationId: string, memoryId: string, to: string) => `opex-chmig-${migrationId}-${memoryId}-${to}`.slice(0, 255)

/** Linha de digest impressa pelo host (marcador para achar o JSON no meio da saída). */
export const DIGEST_MARKER = "OPEX_DIGEST:"

/** Lê o digest da saída do host; `null` sem o marcador ou com JSON inválido. */
export function parseDigestOutput(output: string): ExportDigest | null {
    const line = output.split("\n").find((item) => item.startsWith(DIGEST_MARKER))
    if (!line) return null
    try {
        const parsed = JSON.parse(line.slice(DIGEST_MARKER.length)) as ExportDigest
        if (!parsed || !Array.isArray(parsed.memories) || typeof parsed.file !== "string") return null
        return parsed
    } catch {
        return null
    }
}
