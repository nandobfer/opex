import { randomUUID } from "node:crypto"
import { DomainError } from "@/lib/api/route"
import { INSTANCE_ID } from "@/lib/instance"
import {
    buildChannelMap,
    buildSubscriptionPlan,
    compareDigests,
    buildRevertMap,
    moveIdempotencyKey,
    type ChannelMapEntry,
    type MigrationDirection,
    type SubscriptionLike,
    type SubscriptionPlanItem,
} from "../../channel-migration/plan"
import { CHANNEL_MIGRATION_EVENT_TYPE, NAMESPACE_EVENT_TYPE } from "../../constants"
import type { ChannelSettingsView, EngramindChannel } from "../../types"
import { engramindCall, type EngramindTarget } from "../client"
import { engramindCodeOf } from "../errors"
import { AcaoAuditoria, auditEngramind, engramindLog, publishEngramind } from "../shared"
import { EXPORT_ROOT, runHostExport } from "./host-export"
import { CHANNEL_MIGRATION_STEPS, ChannelMigration, type ChannelMigrationConflict, type ChannelMigrationStep, type IChannelMapItem, type IChannelMigration } from "./model"
import { rewriteStoredSlugs } from "./stored-slugs"
import type { ChannelMigrationDto, ChannelMigrationStateDto } from "../../channel-migration/types"

/**
 * Executor da migração B (OPE-206): os canais do dono passam de `agentes/...` para `<app>/agentes/...` e a volta atrás
 * desfaz. Cada passo é idempotente e grava o progresso no documento: rodar de novo continua de onde parou.
 *
 * 1. backup (export no host); 2. manutenção (portão das memórias); 3. mapa (restaura origens arquivadas e confere o
 * export contra a listagem do Opex); 4. destinos (nome, descrição, prioridade e configurações do canal); 5. assinaturas
 * novas (mesmo modo, acesso e prioridade, inclusive de outros apps); 6. `move` de todas as memórias (`Idempotency-Key`;
 * duplicata fica na origem como conflito); 7. remove as assinaturas antigas; 8. Mongo + modo dos nomes; 9. novo export e
 * conferência; 10. só então arquiva as origens (nunca exclui) e desliga a manutenção.
 * Nunca chama exclusão de memória nem de canal.
 */

const HEARTBEAT_MS = 15_000
const STALE_MS = 90_000
const RATE_LIMIT_WAIT_MS = 5_000
const RATE_LIMIT_RETRIES = 12
const LIST_MAX_PAGES = 200
const LOG_MAX = 200
const enc = encodeURIComponent

let active: Promise<void> | null = null
let rateLimitWaitMs = RATE_LIMIT_WAIT_MS

/** Testes: espera curta no `429`. */
export function setChannelMigrationRateLimitWait(ms: number | null): void {
    rateLimitWaitMs = ms ?? RATE_LIMIT_WAIT_MS
}

/** Testes: espera a execução em segundo plano. */
export async function channelMigrationIdle(): Promise<void> {
    await active
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))
const stepIndex = (step: ChannelMigrationStep) => CHANNEL_MIGRATION_STEPS.indexOf(step)

/** Execução viva: batimento recente (de qualquer instância) ou a deste processo. */
export function isMigrationLive(doc: Pick<IChannelMigration, "status" | "beatAt">, now = Date.now()): boolean {
    return doc.status === "running" && Boolean(doc.beatAt) && now - new Date(doc.beatAt!).getTime() < STALE_MS
}

async function publish(type: string = CHANNEL_MIGRATION_EVENT_TYPE): Promise<void> {
    await publishEngramind({ type }).catch(() => undefined)
}

/** Chamada ao Engramind repetindo no `429 RATE_LIMITED`. */
async function call<T>(method: "GET" | "POST" | "PUT" | "DELETE", request: { path: string; query?: Record<string, string | number | boolean | undefined>; body?: unknown }, target: EngramindTarget, idempotencyKey?: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await engramindCall<T>(method, request as never, { target, ...(idempotencyKey ? { idempotencyKey } : {}) })
        } catch (error) {
            if (engramindCodeOf(error) !== "RATE_LIMITED" || attempt >= RATE_LIMIT_RETRIES) throw error
            await sleep(rateLimitWaitMs)
        }
    }
}

async function listPaged<T>(path: string, key: string, query: Record<string, string | number | boolean>, target: EngramindTarget): Promise<T[]> {
    const rows: T[] = []
    let cursor: string | null = null
    for (let page = 0; page < LIST_MAX_PAGES; page++) {
        const result: Record<string, unknown> | null = await call("GET", { path, query: { ...query, limit: 200, ...(cursor ? { cursor } : {}) } }, target)
        rows.push(...(((result?.[key] as T[] | undefined) ?? []) as T[]))
        cursor = (result?.next_cursor as string | null | undefined) ?? null
        if (!cursor) break
    }
    return rows
}

/** Memórias de um canal em todos os status (só id, canal e status). */
async function channelMemories(slug: string, target: EngramindTarget): Promise<{ id: string; channel: string; status: string }[]> {
    const rows = await listPaged<{ id: string; channel: string; status: string }>("/v1/memories", "memories", { channels: slug, status: "active,permanent,archived", fields: "title" }, target)
    return rows.filter((row) => row.channel === slug)
}

async function getChannel(slug: string, target: EngramindTarget): Promise<EngramindChannel | null> {
    try {
        return await call<EngramindChannel>("GET", { path: `/v1/channels/${enc(slug)}` }, target)
    } catch (error) {
        if (engramindCodeOf(error) === "CHANNEL_NOT_FOUND") return null
        throw error
    }
}

async function load(id: string): Promise<IChannelMigration> {
    const { dbConnect } = await import("@/lib/db")
    await dbConnect()
    const doc = await ChannelMigration.findById(id).lean<IChannelMigration | null>()
    if (!doc) throw new DomainError(404, "Migração dos canais não encontrada", "CHANNEL_MIGRATION_NOT_FOUND")
    return doc
}

async function save(id: string, set: Partial<IChannelMigration>, log?: { step: string; message: string }): Promise<void> {
    const update: Record<string, unknown> = { $set: { ...set, beatAt: new Date(), instance: INSTANCE_ID } }
    if (log) update.$push = { log: { $each: [{ at: new Date(), ...log }], $slice: -LOG_MAX } }
    await ChannelMigration.updateOne({ _id: id }, update)
    if (log) engramindLog.info({ migrationId: id, step: log.step }, `[engramind] migração dos canais: ${log.message}`)
    await publish()
}

async function audit(actorId: string, id: string, passo: string, detail: Record<string, unknown>): Promise<void> {
    await auditEngramind(actorId, `channel-migration:${id}`, AcaoAuditoria.EXECUTAR, { passo: `channel-migration.${passo}`, migracao: id, ...detail })
}

// ── passos ──────────────────────────────────────────────────────────────────

async function stepBackup(doc: IChannelMigration, actorId: string): Promise<void> {
    if (doc.backup) return
    const digest = await runHostExport(`${EXPORT_ROOT}/${doc._id}/antes`, { scriptPath: doc.scriptPath })
    await save(doc._id, { backup: { ...digest, at: new Date() } }, { step: "backup", message: `backup com ${digest.totals.memories} memória(s) em ${digest.file}` })
    await audit(actorId, doc._id, "backup", { arquivo: digest.file, totais: digest.totals.byStatus, memorias: digest.totals.memories })
}

async function stepMaintenance(doc: IChannelMigration): Promise<void> {
    const { setMemoryMaintenance } = await import("../instance")
    await setMemoryMaintenance({ migrationId: doc._id, startedAt: new Date(doc.startedAt) })
    await save(doc._id, {}, { step: "maintenance", message: "consumidores de memória em espera (Migrando canais de memória)" })
}

async function stepMap(doc: IChannelMigration, target: EngramindTarget, actorId: string): Promise<IChannelMapItem[]> {
    let map: ChannelMapEntry[]
    let tooLong: string[] = doc.tooLong ?? []
    if (doc.map?.length) {
        // Retomada: o mapa gravado manda (o `wasArchived` foi lido antes de qualquer origem ser restaurada).
        map = doc.map
    } else {
        const channels = await listPaged<EngramindChannel>("/v1/channels", "channels", { include_archived: true }, target)
        if (doc.direction === "forward") ({ map, tooLong } = buildChannelMap(channels, doc.app))
        else map = buildRevertMap((await load(doc.revertOf!)).map, channels, doc.app)
        // Grava o mapa antes de restaurar qualquer origem arquivada.
        await save(doc._id, { map: map.map((entry) => ({ ...entry, restoredOrigin: false, ready: false, moved: false })), tooLong })
    }
    const items: IChannelMapItem[] = []
    for (const raw of map) {
        const entry: ChannelMapEntry = { from: raw.from, to: raw.to, wasArchived: raw.wasArchived, name: raw.name, description: raw.description, priority: raw.priority }
        const origin = await getChannel(entry.from, target)
        if (!origin) {
            // Origem que não existe mais (volta atrás de um canal que sumiu): nada a mover.
            items.push({ ...entry, restoredOrigin: false, ready: true, moved: true })
            continue
        }
        let restoredOrigin = (raw as Partial<IChannelMapItem>).restoredOrigin ?? false
        if (origin.archived_at) {
            await call("POST", { path: `/v1/channels/${enc(entry.from)}/restore`, body: {} }, target)
            restoredOrigin = true
        }
        items.push({ ...entry, restoredOrigin, ready: false, moved: false })
    }
    await save(doc._id, { map: items })
    // O export precisa ser deste Engramind: os ids de cada origem batem com a listagem do Opex.
    const backupIds = new Map<string, Set<string>>()
    for (const memory of doc.backup?.memories ?? []) backupIds.set(memory.channel, (backupIds.get(memory.channel) ?? new Set()).add(memory.id))
    for (const item of items) {
        if (item.moved) continue
        const listed = await channelMemories(item.from, target)
        const expected = backupIds.get(item.from) ?? new Set<string>()
        const missing = listed.filter((memory) => !expected.has(memory.id))
        if (missing.length || listed.length !== expected.size) {
            // Antes de qualquer `move`: a próxima execução refaz o backup (com a manutenção já ligada) em vez de repetir o velho.
            await save(doc._id, { backup: null, step: "backup" }, { step: "map", message: `backup diferente do Engramind no canal ${item.from}: o backup será refeito na retomada` })
            throw new DomainError(409, `O backup não confere com o Engramind no canal ${item.from} (${expected.size} no backup, ${listed.length} na listagem). Confira se o script exporta o mesmo Engramind da integração.`, "CHANNEL_MIGRATION_BACKUP_MISMATCH")
        }
    }
    await save(doc._id, { map: items, tooLong }, { step: "map", message: `${items.length} canal(is) no mapa${tooLong.length ? `, ${tooLong.length} com nome novo longo demais (ficam na origem)` : ""}` })
    await audit(actorId, doc._id, "map", { canais: items.map((item) => `${item.from} → ${item.to}`), restaurados: items.filter((item) => item.restoredOrigin).map((item) => item.from), longos: tooLong })
    return items
}

async function stepDestinations(doc: IChannelMigration, target: EngramindTarget): Promise<void> {
    const map = [...doc.map]
    for (const [index, entry] of map.entries()) {
        if (entry.ready) continue
        const existing = await getChannel(entry.to, target)
        if (!existing) {
            await call("POST", { path: "/v1/channels", body: { slug: entry.to, name: entry.name.slice(0, 120), description: entry.description, ...(entry.priority !== null ? { priority: entry.priority } : {}) } }, target, `opex-chmig-${doc._id}-ch-${entry.to}`.slice(0, 255))
        } else if (existing.archived_at) {
            await call("POST", { path: `/v1/channels/${enc(entry.to)}/restore`, body: {} }, target)
        }
        const view = await call<ChannelSettingsView | null>("GET", { path: `/v1/channels/${enc(entry.from)}/settings` }, target).catch(() => null)
        const overrides = Object.fromEntries((view?.settings ?? []).filter((item) => item.override !== null && item.override !== undefined).map((item) => [item.key, item.override]))
        if (Object.keys(overrides).length) await call("PUT", { path: `/v1/channels/${enc(entry.to)}/settings`, body: overrides }, target)
        map[index] = { ...entry, ready: true }
        await save(doc._id, { map }, { step: "destinations", message: `destino ${entry.to} pronto${Object.keys(overrides).length ? ` (${Object.keys(overrides).length} configuração(ões) copiadas)` : ""}` })
    }
}

async function stepSubscriptions(doc: IChannelMigration, target: EngramindTarget, actorId: string): Promise<SubscriptionPlanItem[]> {
    let plan = doc.subscriptions
    if (!plan.length) {
        const rows: SubscriptionLike[] = []
        for (const entry of doc.map) rows.push(...(await listPaged<SubscriptionLike>("/v1/subscriptions", "subscriptions", { channel: entry.from }, target).catch((error: unknown) => (engramindCodeOf(error) === "CHANNEL_NOT_FOUND" ? [] : Promise.reject(error)))))
        plan = buildSubscriptionPlan(rows, doc.direction, doc.app, doc.map)
    }
    for (const [index, item] of plan.entries()) {
        if (item.newId) continue
        let newId: string | null = null
        try {
            const written = await call<{ id?: string } | null>(
                "POST",
                { path: "/v1/subscriptions", body: { agent: item.agent, target: item.toTarget, mode: item.mode, ...(item.access ? { access: item.access } : {}), ...(item.priority !== null ? { priority: item.priority } : {}) } },
                target,
                `opex-chmig-${doc._id}-sub-${item.oldId}`.slice(0, 255),
            )
            newId = written?.id ?? null
        } catch (error) {
            if (engramindCodeOf(error) !== "SUBSCRIPTION_EXISTS") throw error
            const details = (error as DomainError).details as { existing?: { id?: string } } | undefined
            newId = details?.existing?.id ?? "existente"
        }
        plan = plan.map((current, position) => (position === index ? { ...current, newId: newId ?? "criada" } : current))
        await save(doc._id, { subscriptions: plan }, { step: "subscriptions", message: `assinatura ${item.agent} → ${item.toTarget}${item.foreign ? " (outro app)" : ""}` })
    }
    await save(doc._id, { subscriptions: plan })
    await audit(actorId, doc._id, "subscriptions", { assinaturas: plan.map((item) => ({ agente: item.agent, de: item.fromTarget, para: item.toTarget, modo: item.mode, outroApp: item.foreign })) })
    return plan
}

const conflictOf = (error: unknown, memoryId: string, channel: string): ChannelMigrationConflict | null => {
    const code = engramindCodeOf(error)
    if (code !== "MEMORY_DUPLICATE" && code !== "MEMORY_KEY_EXISTS") return null
    const details = (error as DomainError).details as { existing_id?: string } | undefined
    return { id: memoryId, channel, code, existingId: details?.existing_id ?? null }
}

async function stepMoves(doc: IChannelMigration, target: EngramindTarget, actorId: string): Promise<void> {
    const map = [...doc.map]
    let conflicts = [...doc.conflicts]
    let movedCount = doc.movedCount
    for (const [index, entry] of map.entries()) {
        if (entry.moved) continue
        const known = new Set(conflicts.map((item) => item.id))
        const memories = await channelMemories(entry.from, target)
        let sinceSave = 0
        for (const memory of memories) {
            if (known.has(memory.id)) continue
            try {
                await call("POST", { path: `/v1/memories/${enc(memory.id)}/move`, body: { to: entry.to } }, target, moveIdempotencyKey(doc._id, memory.id, entry.to))
                movedCount++
            } catch (error) {
                const conflict = conflictOf(error, memory.id, entry.from)
                if (!conflict) throw error
                // Duplicata no destino: nada é sobrescrito; a memória fica na origem para o dono resolver.
                conflicts = [...conflicts, conflict]
                known.add(memory.id)
            }
            if (++sinceSave >= 20) {
                sinceSave = 0
                await save(doc._id, { movedCount, conflicts })
            }
        }
        map[index] = { ...entry, moved: true }
        await save(doc._id, { map, movedCount, conflicts }, { step: "moves", message: `${entry.from} → ${entry.to}: ${memories.length} memória(s) tratadas` })
    }
    await audit(actorId, doc._id, "moves", { movidas: movedCount, conflitos: conflicts })
}

async function stepUnsubscribe(doc: IChannelMigration, target: EngramindTarget, actorId: string): Promise<void> {
    let plan = doc.subscriptions
    for (const [index, item] of plan.entries()) {
        if (item.removed || !item.newId) continue
        try {
            // Cancela só a assinatura antiga (nunca canal ou memória).
            await call("DELETE", { path: `/v1/subscriptions/${enc(item.oldId)}` }, target)
        } catch (error) {
            if (engramindCodeOf(error) !== "SUBSCRIPTION_NOT_FOUND") throw error
        }
        plan = plan.map((current, position) => (position === index ? { ...current, removed: true } : current))
        await save(doc._id, { subscriptions: plan })
    }
    await save(doc._id, {}, { step: "unsubscribe", message: `${plan.length} assinatura(s) antiga(s) removida(s)` })
    await audit(actorId, doc._id, "unsubscribe", { removidas: plan.map((item) => item.oldId) })
}

async function stepMongo(doc: IChannelMigration, actorId: string): Promise<void> {
    const counts = await rewriteStoredSlugs(doc.map)
    const { setChannelNaming } = await import("../instance")
    await setChannelNaming(doc.direction === "forward" ? "prefixed" : "legacy")
    await save(doc._id, { mongo: counts }, { step: "mongo", message: `slugs guardados no Opex atualizados e nomes ${doc.direction === "forward" ? "com o app" : "antigos"} em uso` })
    await audit(actorId, doc._id, "mongo", { contagens: counts, nomes: doc.direction === "forward" ? "prefixed" : "legacy" })
    await publish(NAMESPACE_EVENT_TYPE)
}

/** Conferência: `true` quando bateu. Falhou → nada é arquivado e a manutenção continua. */
async function stepVerify(doc: IChannelMigration, actorId: string): Promise<boolean> {
    const attempt = (doc.log ?? []).filter((item) => item.step === "verify").length + 1
    const after = await runHostExport(`${EXPORT_ROOT}/${doc._id}/depois-${attempt}`, { scriptPath: doc.scriptPath })
    const result = compareDigests(doc.backup!, after, doc.map, doc.conflicts)
    await save(doc._id, { verify: { file: after.file, totals: after.totals, ok: result.ok, problems: result.problems, at: new Date() } }, { step: "verify", message: result.ok ? `conferência ok (${result.checked} memória(s))` : `conferência falhou: ${result.problems.length} problema(s)` })
    await audit(actorId, doc._id, "verify", { ok: result.ok, arquivo: after.file, totais: after.totals.byStatus, problemas: result.problems })
    return result.ok
}

async function stepArchive(doc: IChannelMigration, target: EngramindTarget, actorId: string): Promise<void> {
    const conflictChannels = new Set(doc.conflicts.map((item) => item.channel))
    const archived = new Set(doc.archived)
    const archive = async (slug: string) => {
        if (archived.has(slug)) return
        try {
            await call("POST", { path: `/v1/channels/${enc(slug)}/archive`, body: {} }, target)
        } catch (error) {
            if (engramindCodeOf(error) !== "CHANNEL_NOT_FOUND" && engramindCodeOf(error) !== "CHANNEL_ARCHIVED") throw error
        }
        archived.add(slug)
        await save(doc._id, { archived: [...archived] })
    }
    for (const entry of doc.map) {
        // Origem com memória em conflito fica ativa até o dono decidir.
        if (!conflictChannels.has(entry.from)) await archive(entry.from)
        if (entry.wasArchived) await archive(entry.to)
    }
    await save(doc._id, {}, { step: "archive", message: `${archived.size} canal(is) arquivado(s) (nada foi excluído)` })
    await audit(actorId, doc._id, "archive", { arquivados: [...archived] })
}

async function finish(doc: IChannelMigration, actorId: string): Promise<void> {
    const { setMemoryMaintenance } = await import("../instance")
    await setMemoryMaintenance(null)
    const status = doc.conflicts.length ? "done_with_conflicts" : "done"
    await save(doc._id, { status, step: "finished", finishedAt: new Date(), error: null }, { step: "finished", message: status === "done" ? "migração concluída" : `migração concluída com ${doc.conflicts.length} conflito(s) na origem` })
    await audit(actorId, doc._id, "finished", { status, movidas: doc.movedCount, conflitos: doc.conflicts.length, assinaturas: doc.subscriptions.length, arquivados: doc.archived.length })
    await publish(NAMESPACE_EVENT_TYPE)
    // Confere a rede no espaço de nomes atual (idempotente: só cria o que faltar).
    const { ensureAgentMemoryNetwork } = await import("../memory-network")
    await ensureAgentMemoryNetwork(actorId).catch(() => undefined)
}

async function execute(id: string, actorId: string): Promise<void> {
    const beat = setInterval(() => void ChannelMigration.updateOne({ _id: id, status: "running" }, { $set: { beatAt: new Date(), instance: INSTANCE_ID } }).catch(() => undefined), HEARTBEAT_MS)
    beat.unref?.()
    try {
        const { engramindTarget } = await import("../client")
        const target = await engramindTarget()
        const at = async (step: ChannelMigrationStep) => {
            const doc = await load(id)
            if (stepIndex(doc.step) > stepIndex(step)) return null
            if (doc.step !== step) await save(id, { step })
            return { ...doc, step }
        }
        // A manutenção vem ANTES do backup e vale em toda retomada até o arquivamento: com as memórias paradas, o
        // backup e a conferência comparam o mesmo acervo.
        await stepMaintenance(await load(id))
        let doc = await at("backup")
        if (doc) await stepBackup(doc, actorId)
        doc = await load(id)
        await save(id, { step: stepIndex(doc.step) > stepIndex("map") ? doc.step : "map" })
        if ((doc = await at("map"))) await stepMap(doc, target, actorId)
        if ((doc = await at("destinations"))) await stepDestinations(doc, target)
        if ((doc = await at("subscriptions"))) await stepSubscriptions(doc, target, actorId)
        if ((doc = await at("moves"))) await stepMoves(doc, target, actorId)
        if ((doc = await at("unsubscribe"))) await stepUnsubscribe(doc, target, actorId)
        if ((doc = await at("mongo"))) await stepMongo(doc, actorId)
        if ((doc = await at("verify"))) {
            if (!(await stepVerify(doc, actorId))) {
                await save(id, { status: "verify_failed", error: "A conferência não bateu: nada foi arquivado e a manutenção continua. Veja os problemas e rode de novo." })
                return
            }
        }
        if ((doc = await at("archive"))) await stepArchive(doc, target, actorId)
        await finish(await load(id), actorId)
    } catch (error) {
        const message = messageOf(error)
        engramindLog.warn({ migrationId: id, err: message }, "[engramind] migração dos canais parou: rode de novo para continuar")
        await save(id, { status: "failed", error: message }, { step: "error", message }).catch(() => undefined)
        await audit(actorId, id, "error", { erro: message }).catch(() => undefined)
        // Antes do primeiro `move` nada mudou no acervo: libera os agentes (a retomada religa a manutenção).
        const failedAt = await load(id).catch(() => null)
        if (failedAt && stepIndex(failedAt.step) <= stepIndex("destinations") && (failedAt.movedCount ?? 0) === 0) {
            const { setMemoryMaintenance } = await import("../instance")
            await setMemoryMaintenance(null).catch(() => undefined)
            await save(id, {}, { step: "error", message: "nenhuma memória foi movida: a manutenção foi desligada até a retomada" }).catch(() => undefined)
        }
    } finally {
        clearInterval(beat)
    }
}

// ── API ─────────────────────────────────────────────────────────────────────

const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null)

export function toChannelMigrationDto(doc: IChannelMigration, now = Date.now()): ChannelMigrationDto {
    const interrupted = doc.status === "running" && !isMigrationLive(doc, now) && !active
    return {
        id: doc._id,
        direction: doc.direction,
        status: interrupted ? "interrupted" : doc.status,
        step: doc.step,
        app: doc.app,
        startedAt: iso(doc.startedAt)!,
        finishedAt: iso(doc.finishedAt),
        error: doc.error,
        backup: doc.backup ? { file: doc.backup.file, memories: doc.backup.totals.memories, byStatus: doc.backup.totals.byStatus } : null,
        verify: doc.verify ? { file: doc.verify.file, memories: doc.verify.totals.memories, byStatus: doc.verify.totals.byStatus, ok: doc.verify.ok, problems: doc.verify.problems } : null,
        channels: (doc.map ?? []).map((item) => ({ from: item.from, to: item.to, wasArchived: item.wasArchived, moved: item.moved })),
        tooLong: doc.tooLong ?? [],
        movedCount: doc.movedCount ?? 0,
        conflicts: doc.conflicts ?? [],
        subscriptions: (doc.subscriptions ?? []).map((item) => ({ agent: item.agent, fromTarget: item.fromTarget, toTarget: item.toTarget, mode: item.mode, foreign: item.foreign, created: Boolean(item.newId), removed: item.removed })),
        archived: doc.archived ?? [],
        mongo: doc.mongo ?? null,
        log: (doc.log ?? []).slice(-50).map((item) => ({ at: iso(item.at)!, step: item.step, message: item.message })),
    }
}

/** Estado da aba (modo dos nomes, script, última execução e o que dá para fazer). */
export async function getChannelMigrationState(): Promise<ChannelMigrationStateDto> {
    const { channelNamespaceOrLegacy } = await import("../instance")
    const { exportScriptPath } = await import("./host-export")
    const [namespace, scriptPath, latest] = await Promise.all([channelNamespaceOrLegacy(), exportScriptPath().catch(() => null), latestChannelMigration()])
    const { dbConnect } = await import("@/lib/db")
    await dbConnect()
    const forwardDone = await ChannelMigration.exists({ direction: "forward", status: { $in: ["done", "done_with_conflicts"] } })
    const busy = Boolean(latest && latest.status === "running")
    return {
        namespace,
        scriptPath,
        current: latest ? toChannelMigrationDto(latest) : null,
        canRevert: namespace.prefixed && Boolean(forwardDone) && !busy,
        canMigrate: !namespace.prefixed && !busy,
    }
}

export interface StartChannelMigrationInput {
    direction: MigrationDirection
    scriptPath?: string | null
}

/** Última migração (qualquer direção). */
export async function latestChannelMigration(): Promise<IChannelMigration | null> {
    const { dbConnect } = await import("@/lib/db")
    await dbConnect()
    return ChannelMigration.findOne({}).sort({ startedAt: -1 }).lean<IChannelMigration | null>()
}

/** Inicia (ou retoma) a migração. Roda em segundo plano; devolve o id. */
export async function startChannelMigration(input: StartChannelMigrationInput, actorId: string): Promise<string> {
    const { requireUsableConnection } = await import("../connection")
    await requireUsableConnection()
    const { channelNamespace, resetInstanceCache } = await import("../instance")
    resetInstanceCache()
    const ns = await channelNamespace()
    const latest = await latestChannelMigration()
    if (latest && isMigrationLive(latest)) throw new DomainError(409, "A migração dos canais já está em andamento.", "CHANNEL_MIGRATION_RUNNING")
    if (active) throw new DomainError(409, "A migração dos canais já está em andamento.", "CHANNEL_MIGRATION_RUNNING")
    const { exportScriptPath } = await import("./host-export")
    const scriptPath = input.scriptPath?.trim() || (await exportScriptPath())
    if (!scriptPath) throw new DomainError(400, "Informe o caminho do script de export das memórias no host: o backup é obrigatório.", "CHANNEL_MIGRATION_SCRIPT_REQUIRED")
    if (input.scriptPath?.trim() && input.scriptPath.trim() !== (await exportScriptPath())) {
        const { updateIntegration } = await import("@/lib/integrations/server")
        const { ENGRAMIND_INTEGRATION_ID } = await import("../../constants")
        await updateIntegration(ENGRAMIND_INTEGRATION_ID, { publicValues: { memoryExportScript: scriptPath } }, actorId)
    }
    let id: string
    const resumable = latest && latest.direction === input.direction && (latest.status === "running" || latest.status === "failed" || latest.status === "verify_failed")
    if (resumable) {
        id = latest._id
        // Conferência que falhou: refaz os `move` (relista as origens; o que já saiu não volta), o Mongo e a conferência.
        const retryMoves = latest.status === "verify_failed" ? { step: "moves" as const, map: latest.map.map((item) => ({ ...item, moved: false })) } : {}
        await ChannelMigration.updateOne({ _id: id }, { $set: { status: "running", error: null, scriptPath, beatAt: new Date(), instance: INSTANCE_ID, ...retryMoves } })
    } else {
        if (input.direction === "forward" && ns.prefixed) throw new DomainError(409, "Os canais já usam o nome do app.", "CHANNEL_MIGRATION_ALREADY_DONE")
        let revertOf: string | null = null
        if (input.direction === "revert") {
            const forward = await ChannelMigration.findOne({ direction: "forward", status: { $in: ["done", "done_with_conflicts"] } }).sort({ startedAt: -1 }).lean<IChannelMigration | null>()
            if (!forward || !ns.prefixed) throw new DomainError(409, "Não há migração concluída para desfazer.", "CHANNEL_MIGRATION_NOTHING_TO_REVERT")
            revertOf = forward._id
        }
        id = randomUUID().replace(/-/g, "").slice(0, 24)
        await ChannelMigration.create({ _id: id, direction: input.direction, revertOf, status: "running", step: "backup", app: ns.app, scriptPath, map: [], tooLong: [], movedCount: 0, conflicts: [], subscriptions: [], backup: null, verify: null, mongo: null, archived: [], log: [], error: null, instance: INSTANCE_ID, beatAt: new Date(), startedAt: new Date(), finishedAt: null })
    }
    await audit(actorId, id, "start", { direcao: input.direction, retomada: Boolean(resumable), app: ns.app })
    await publish()
    active = execute(id, actorId).finally(() => {
        active = null
    })
    return id
}
