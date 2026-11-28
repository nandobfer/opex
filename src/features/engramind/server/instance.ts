import { DomainError } from "@/lib/api/route"
import { instanceAppOf, LEGACY_NAMESPACE, LOGICAL_AGENTS_PREFIX, type ChannelNamespace } from "../channel-namespace"
import { OPEX_APP_SLUG } from "../constants"
import type { EngramindChannel, WhoAmI } from "../types"

/**
 * App e espaço de nomes da instância do Opex no Engramind (OPE-206).
 *
 * - `instanceApp()`: o app da chave configurada, com a regra do `connection.ts` (chave do bootstrap → `opex`).
 *   Fica em cache no processo e é gravado em `engramind_state.instance` (reserva com o Engramind fora do ar).
 * - `channelNamespace()`: o app + o modo dos nomes (`engramind_state.channelNaming`). Sem modo gravado, decide uma
 *   vez e grava: `legacy` só quando o app é `opex` e já existem canais `agentes/...` (o dono antes da migração B);
 *   senão `prefixed`.
 * - `isMemoryMaintenance()`: a migração B está rodando (portão das memórias).
 */

const NAMESPACE_TTL_MS = 60_000
const MAINTENANCE_TTL_MS = 5_000
const CHANNEL_SCAN_MAX_PAGES = 20

let namespaceCache: { at: number; value: ChannelNamespace } | null = null
let maintenanceCache: { at: number; value: MemoryMaintenance | null } | null = null

export interface MemoryMaintenance {
    migrationId: string
    startedAt: Date
}

/** Zera os caches (conexão salva, migrações A e B, testes). */
export function resetInstanceCache(): void {
    namespaceCache = null
    maintenanceCache = null
}

/** App da instância a partir do `whoami` (puro). */
export const appOfWhoami = (whoami: Pick<WhoAmI, "app">): string => instanceAppOf(whoami.app.slug)

async function stateModels() {
    const { EngramindState, ENGRAMIND_STATE_ID, engramindDb } = await import("./models")
    await engramindDb()
    return { EngramindState, ENGRAMIND_STATE_ID }
}

/** App da instância (`whoami` com cache; reserva gravada; sem nenhum dos dois, o erro sobe). */
export async function instanceApp(): Promise<string> {
    const { fetchWhoami } = await import("./connection")
    const { EngramindState, ENGRAMIND_STATE_ID } = await stateModels()
    try {
        const whoami = await fetchWhoami()
        const app = appOfWhoami(whoami)
        const stored = (await EngramindState.findById(ENGRAMIND_STATE_ID).select({ instance: 1 }).lean())?.instance
        if (!stored || stored.app !== app || stored.tokenId !== whoami.token_id) {
            await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { instance: { app, tokenId: whoami.token_id, resolvedAt: new Date() } } }, { upsert: true })
        }
        return app
    } catch (error) {
        const stored = (await EngramindState.findById(ENGRAMIND_STATE_ID).select({ instance: 1 }).lean())?.instance
        if (stored?.app) return stored.app
        throw error
    }
}

/** Algum canal com nome antigo `agentes/...` no Engramind (inclusive arquivados). */
async function hasLegacyAgentChannels(): Promise<boolean> {
    const { engramindCall } = await import("./client")
    let cursor: string | null = null
    for (let page = 0; page < CHANNEL_SCAN_MAX_PAGES; page++) {
        const query: Record<string, string | number | boolean> = { include_archived: true, limit: 200 }
        if (cursor) query.cursor = cursor
        const result: { channels?: EngramindChannel[]; next_cursor?: string | null } | null = await engramindCall("GET", { path: "/v1/channels", query })
        if ((result?.channels ?? []).some((channel) => channel.slug.startsWith(`${LOGICAL_AGENTS_PREFIX}/`))) return true
        cursor = result?.next_cursor ?? null
        if (!cursor) return false
    }
    return false
}

/** Modo dos nomes ainda não gravado: decide (e grava) pela regra da OPE-206. */
async function decideNaming(app: string): Promise<"legacy" | "prefixed" | null> {
    if (app !== OPEX_APP_SLUG) return "prefixed"
    try {
        return (await hasLegacyAgentChannels()) ? "legacy" : "prefixed"
    } catch {
        // Engramind fora do ar: não grava (o dono segue nos nomes antigos até conseguir decidir).
        return null
    }
}

/** Espaço de nomes da instância (cache de 60 s). */
export async function channelNamespace(): Promise<ChannelNamespace> {
    if (namespaceCache && Date.now() - namespaceCache.at < NAMESPACE_TTL_MS) return namespaceCache.value
    const app = await instanceApp()
    const { EngramindState, ENGRAMIND_STATE_ID } = await stateModels()
    let naming = (await EngramindState.findById(ENGRAMIND_STATE_ID).select({ channelNaming: 1 }).lean())?.channelNaming ?? null
    if (!naming) {
        naming = await decideNaming(app)
        if (naming) await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID, $or: [{ channelNaming: null }, { channelNaming: { $exists: false } }] }, { $set: { channelNaming: naming } }, { upsert: false })
    }
    // Os nomes antigos são os canais do dono: só valem no app `opex`. Com a chave de outro app no mesmo banco (cópia ou
    // troca da chave), o `legacy` gravado não vale e a instância usa o próprio app na frente.
    const value: ChannelNamespace = app === OPEX_APP_SLUG && naming !== "prefixed" ? { app, prefixed: false } : { app, prefixed: true }
    namespaceCache = { at: Date.now(), value }
    return value
}

/** Espaço de nomes sem lançar (tela e leituras de reserva): sem conexão, os nomes antigos do dono. */
export async function channelNamespaceOrLegacy(): Promise<ChannelNamespace> {
    try {
        return await channelNamespace()
    } catch {
        return LEGACY_NAMESPACE
    }
}

/** Grava o modo dos nomes (migração B e volta atrás) e zera o cache. */
export async function setChannelNaming(naming: "legacy" | "prefixed"): Promise<void> {
    const { EngramindState, ENGRAMIND_STATE_ID } = await stateModels()
    await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { channelNaming: naming } }, { upsert: true })
    resetInstanceCache()
}

/** Migração B em andamento (cache de 5 s); `null` fora dela. Nunca lança. */
export async function memoryMaintenance(): Promise<MemoryMaintenance | null> {
    if (maintenanceCache && Date.now() - maintenanceCache.at < MAINTENANCE_TTL_MS) return maintenanceCache.value
    try {
        const { EngramindState, ENGRAMIND_STATE_ID } = await stateModels()
        const state = (await EngramindState.findById(ENGRAMIND_STATE_ID).select({ channelMigration: 1 }).lean())?.channelMigration
        const value = state?.active ? { migrationId: state.migrationId, startedAt: new Date(state.startedAt) } : null
        maintenanceCache = { at: Date.now(), value }
        return value
    } catch {
        return null
    }
}

export async function isMemoryMaintenance(): Promise<boolean> {
    return Boolean(await memoryMaintenance())
}

/**
 * Espera a migração B terminar (consumidores em segundo plano: Mentor, respostas automáticas do Secretário). Confere
 * a cada `pollMs`; `maxMs` evita esperar para sempre (padrão: 6 h). Devolve se esperou.
 */
export async function waitForMemoryMaintenance(options: { pollMs?: number; maxMs?: number; signal?: AbortSignal } = {}): Promise<boolean> {
    const pollMs = options.pollMs ?? 15_000
    const deadline = Date.now() + (options.maxMs ?? 6 * 3600_000)
    let waited = false
    while ((await isMemoryMaintenance()) && Date.now() < deadline && !options.signal?.aborted) {
        waited = true
        await new Promise((resolve) => setTimeout(resolve, pollMs))
        maintenanceCache = null
    }
    return waited
}

export const MEMORY_MAINTENANCE_NOTICE = "Migrando canais de memória"
export const MEMORY_MAINTENANCE_CODE = "ENGRAMIND_MIGRATING"

/** Recusa a gravação de memória durante a migração B. */
export async function assertNoMemoryMaintenance(): Promise<void> {
    if (await isMemoryMaintenance()) throw new DomainError(503, `${MEMORY_MAINTENANCE_NOTICE}: tente de novo em alguns minutos.`, MEMORY_MAINTENANCE_CODE)
}

/** Liga/desliga a manutenção (migração B). */
export async function setMemoryMaintenance(value: MemoryMaintenance | null): Promise<void> {
    const { EngramindState, ENGRAMIND_STATE_ID } = await stateModels()
    await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { channelMigration: value ? { active: true, migrationId: value.migrationId, startedAt: value.startedAt } : null } }, { upsert: true })
    maintenanceCache = null
}
