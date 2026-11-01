import { createHash } from "node:crypto"
import mongoose from "mongoose"
import { AI_AGENTS, isAiAgentId } from "@/features/ai/agents"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { getLocalUser } from "@/lib/local-user"
import type { AiProviderId } from "@/lib/ai/providers"
import {
    CURATOR_CHUNK,
    CURATOR_CONSUMPTION_ORIGIN,
    CURATOR_TIMEOUT_MS,
    CURATOR_DECISIONS,
    applyCuratorRules,
    budgetCombinations,
    buildCompactInstructions,
    buildCuratorInstructions,
    buildCuratorPrompt,
    channelOfSource,
    estimateBudgets,
    isOwnerAuthored,
    parseCuratorAnswer,
    type CuratorDecision,
    type CuratorSourceItem,
} from "../memory-curator"
import type { CuratorRunInput, MigrationBulkInput, MigrationItemPatch } from "../schemas/migration"
import type { ImportResult, MemoryMigrationDto, MigrationItemDto, MigrationStepDto } from "../types"
import { engramindCall } from "./client"
import { importIdempotencyKey } from "./operations-runner"
import { LEGACY_MEMORIES_COLLECTION, MIGRATION_ID, MemoryBackup, MemoryMigration, type IMemoryMigration, type IMigrationItem, type IMigrationStep } from "./migration-models"
import { AcaoAuditoria, auditEngramind, engramindLog, publishEngramind } from "./shared"

/**
 * Migração das memórias dos agentes para o Engramind (aba "Migração de memórias", OPE-104):
 * 1. **Backup**: lê toda a `agent_memories` (sem alterar nada) e guarda o JSON com SHA-256.
 * 2. **Curador**: classifica 100% das memórias (`streamAi`, provedor e modelo da tela, sem ferramentas),
 *    com as regras do Opex por cima (`applyCuratorRules`). Exige o backup.
 * 3. **Revisão do dono**: aprovar, rejeitar ou editar (uma a uma ou em lote por lista).
 * 4. **Importação**: só as aprovadas, por canal, em lotes de `limits.max_batch`, com
 *    `Idempotency-Key` de `importIdempotencyKey` (a mesma da importação manual) — repetir não duplica.
 * As etapas longas rodam no servidor (sobrevivem a fechar a tela) com o estado persistido; uma etapa
 * ainda "em andamento" de antes de um reinício vira falha com "Tentar novamente".
 */

const PROCESS_STARTED_AT = new Date()
const IDLE_STEP: IMigrationStep = { status: "idle", error: null, startedAt: null, finishedAt: null, progress: null }
type StepKey = keyof IMemoryMigration["steps"]
const STEP_KEYS: StepKey[] = ["backup", "triage", "compact", "import"]

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")
const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null)

async function publish(): Promise<void> {
    await publishEngramind({ type: "migration.updated" }).catch(() => undefined)
}

/** Estado (cria o singleton; etapa "em andamento" de antes do reinício vira falha). */
async function loadState(): Promise<IMemoryMigration> {
    await dbConnect()
    const fresh: IMemoryMigration = { _id: MIGRATION_ID, backupId: null, steps: { backup: IDLE_STEP, triage: IDLE_STEP, compact: IDLE_STEP, import: IDLE_STEP }, curator: null, items: [], firstCompletedAt: null, lastImportAt: null }
    let state = (await MemoryMigration.findById(MIGRATION_ID).lean<IMemoryMigration>()) ?? null
    if (!state) {
        const { _id, ...insert } = fresh
        await MemoryMigration.updateOne({ _id }, { $setOnInsert: insert }, { upsert: true })
        state = (await MemoryMigration.findById(MIGRATION_ID).lean<IMemoryMigration>()) ?? fresh
    }
    const steps = { ...{ backup: IDLE_STEP, triage: IDLE_STEP, compact: IDLE_STEP, import: IDLE_STEP }, ...(state.steps ?? {}) }
    const orphan = STEP_KEYS.filter((key) => steps[key].status === "running" && steps[key].startedAt && new Date(steps[key].startedAt!) < PROCESS_STARTED_AT && !running.has(key))
    if (orphan.length) {
        const set = Object.fromEntries(orphan.map((key) => [`steps.${key}`, { ...steps[key], status: "failed", error: "Interrompida pelo reinício do Opex: tente novamente", finishedAt: new Date() }]))
        await MemoryMigration.updateOne({ _id: MIGRATION_ID }, { $set: set })
        engramindLog.warn({ steps: orphan }, "[engramind] etapas da migração de memórias interrompidas pelo reinício")
        return loadState()
    }
    return { ...fresh, ...state, items: state.items ?? [], steps }
}

async function setStep(key: StepKey, step: Partial<IMigrationStep>): Promise<void> {
    const state = await loadState()
    await MemoryMigration.updateOne({ _id: MIGRATION_ID }, { $set: { [`steps.${key}`]: { ...state.steps[key], ...step } } })
    await publish()
}

const running = new Set<StepKey>()

/** Roda uma etapa em segundo plano (uma por vez por etapa; a requisição responde na hora). */
function runInBackground(key: StepKey, work: () => Promise<void>): void {
    running.add(key)
    void (async () => {
        try {
            await setStep(key, { status: "running", error: null, startedAt: new Date(), finishedAt: null, progress: null })
            await work()
            await setStep(key, { status: "done", finishedAt: new Date() })
        } catch (error) {
            engramindLog.warn({ step: key, err: messageOf(error) }, "[engramind] etapa da migração de memórias falhou")
            await setStep(key, { status: "failed", error: messageOf(error), finishedAt: new Date() }).catch(() => undefined)
        } finally {
            running.delete(key)
        }
    })()
}

function assertIdle(state: IMemoryMigration, keys: StepKey[]): void {
    const busy = keys.find((key) => state.steps[key].status === "running" || running.has(key))
    if (busy) throw new DomainError(409, "Uma etapa da migração ainda está em andamento: aguarde", "MIGRATION_BUSY")
}

/** Memórias da coleção antiga (somente leitura). */
async function legacyCollection() {
    await dbConnect()
    const db = mongoose.connection.db
    if (!db) throw new DomainError(503, "Banco indisponível", "DB_UNAVAILABLE")
    return db.collection(LEGACY_MEMORIES_COLLECTION)
}

export async function legacyMemoryCount(): Promise<number> {
    return (await legacyCollection()).countDocuments({})
}

/** Ainda não houve importação concluída (e existem memórias antigas para migrar). */
export async function isMemoryMigrationPending(): Promise<boolean> {
    const state = await loadState()
    if (state.firstCompletedAt) return false
    return (await legacyMemoryCount()) > 0
}

// ── Etapa 1: backup ─────────────────────────────────────────────────────────

interface LegacyMemory {
    _id: unknown
    agentId?: string
    centralId?: string | null
    texto?: string
    resumo?: string
    origin?: { source?: string; label?: string } | null
    createdBy?: string
    updatedBy?: string
    createdAt?: Date
    updatedAt?: Date
}

export async function generateBackup(actorId: string): Promise<MemoryMigrationDto> {
    const state = await loadState()
    assertIdle(state, ["backup", "triage", "compact", "import"])
    const rows = (await (await legacyCollection()).find({}).sort({ createdAt: 1, _id: 1 }).toArray()) as unknown as LegacyMemory[]
    const memories = rows.map((row) => ({
        id: String(row._id),
        lista: row.agentId ?? "",
        central: row.centralId ?? null,
        texto: row.texto ?? "",
        resumo: row.resumo ?? "",
        origem: row.origin?.source ? { source: row.origin.source, label: row.origin.label ?? row.origin.source } : null,
        autor: row.createdBy ?? null,
        atualizadoPor: row.updatedBy ?? null,
        criadaEm: iso(row.createdAt),
        atualizadaEm: iso(row.updatedAt),
    }))
    const content = JSON.stringify(memories)
    const hash = sha256(content)
    const backupId = new mongoose.Types.ObjectId().toString()
    const createdAt = new Date()
    await MemoryBackup.create({ _id: backupId, createdAt, count: memories.length, sha256: hash, json: content })
    const localId = getLocalUser().id
    const previous = new Map(state.items.map((item) => [item.sourceId, item]))
    const items: IMigrationItem[] = rows.map((row) => {
        const before = previous.get(String(row._id))
        const texto = row.texto ?? ""
        const origin = row.origin?.source ? { source: row.origin.source, label: row.origin.label ?? row.origin.source } : null
        const base = { sourceId: String(row._id), list: row.agentId ?? "", centralId: row.centralId ?? null }
        const unchanged = before && before.texto === texto
        return {
            ...base,
            texto,
            resumo: row.resumo ?? "",
            origin,
            createdBy: row.createdBy ?? localId,
            createdAt: row.createdAt ?? createdAt,
            updatedAt: row.updatedAt ?? createdAt,
            ownerProtected: isOwnerAuthored({ createdBy: row.createdBy, origin }, localId),
            channel: channelOfSource(base),
            // Rodar de novo preserva o que já foi decidido, revisado e importado (texto igual).
            decision: unchanged ? before.decision : null,
            review: unchanged ? before.review : { status: "pendente", texto: null, categoria: null, at: null },
            imported: unchanged ? before.imported : null,
        }
    })
    await MemoryMigration.updateOne({ _id: MIGRATION_ID }, { $set: { backupId, items, "steps.backup": { status: "done", error: null, startedAt: createdAt, finishedAt: new Date(), progress: { done: items.length, total: items.length } } } })
    await auditEngramind(actorId, "migracao", AcaoAuditoria.EXECUTAR, { passo: "backup", memorias: memories.length, sha256: hash })
    engramindLog.info({ count: memories.length, sha256: hash }, "[engramind] backup das memórias dos agentes gerado")
    await publish()
    return getMigration()
}

/** Snapshot baixável: o backup original (com o hash) e o id do Engramind de cada memória importada. */
export async function downloadBackup(): Promise<{ filename: string; body: string }> {
    const state = await loadState()
    if (!state.backupId) throw new DomainError(404, "Gere o backup antes", "MIGRATION_NO_BACKUP")
    const backup = await MemoryBackup.findById(state.backupId).lean()
    if (!backup) throw new DomainError(404, "Backup não encontrado", "MIGRATION_NO_BACKUP")
    const imported = Object.fromEntries(state.items.filter((item) => item.imported).map((item) => [item.sourceId, item.imported!.engramindId]))
    const memories = (JSON.parse(backup.json) as { id: string }[]).map((memory) => ({ ...memory, engramindId: imported[memory.id] ?? null }))
    const body = JSON.stringify({ geradoEm: backup.createdAt, colecao: LEGACY_MEMORIES_COLLECTION, total: backup.count, sha256: backup.sha256, observacao: "sha256 do conteúdo original (sem o engramindId)", memorias: memories }, null, 2)
    return { filename: `opex-memorias-backup-${new Date(backup.createdAt).toISOString().slice(0, 10)}.json`, body }
}

// ── Etapa 2: curador ────────────────────────────────────────────────────────

const sourceOf = (item: IMigrationItem): CuratorSourceItem => ({
    id: item.sourceId,
    list: item.list,
    centralId: item.centralId,
    texto: item.texto,
    resumo: item.resumo,
    origin: item.origin,
    createdBy: item.createdBy,
    createdAt: new Date(item.createdAt).toISOString(),
    ownerProtected: item.ownerProtected,
})

const groupKey = (item: Pick<IMigrationItem, "list" | "centralId">) => `${item.list}|${item.centralId ?? ""}`

/**
 * Uma chamada ao curador com tempo máximo (`CURATOR_TIMEOUT_MS`): o stream é abortado e a chamada falha
 * com mensagem acionável, para a etapa nunca ficar "em andamento" para sempre.
 */
async function askCurator(input: CuratorRunInput, instructions: string, prompt: string, subject: string, timeoutMs = CURATOR_TIMEOUT_MS): Promise<string> {
    const { streamAi } = await import("@/lib/ai/stream")
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort()
            reject(new Error(`O curador não respondeu em ${Math.round(timeoutMs / 60_000)} min: tente novamente ou escolha outro modelo`))
        }, timeoutMs)
    })
    const read = async () => {
        let text = ""
        for await (const event of streamAi({
            provider: input.provider as AiProviderId,
            model: input.model,
            variant: input.variant ?? null,
            instructions,
            prompt,
            title: `Curador de memórias · ${subject}`,
            signal: controller.signal,
            consumption: { origin: CURATOR_CONSUMPTION_ORIGIN, subject },
        })) {
            if (event.type === "delta") text += event.text
            if (event.type === "error") throw new Error(event.message)
        }
        return text
    }
    try {
        return await Promise.race([read(), timeout])
    } finally {
        clearTimeout(timer)
    }
}

/** Testes: tempo máximo do curador (padrão `CURATOR_TIMEOUT_MS`). */
let curatorTimeoutMs = CURATOR_TIMEOUT_MS
export function setCuratorTimeoutForTests(ms: number | null): void {
    curatorTimeoutMs = ms ?? CURATOR_TIMEOUT_MS
}

export async function runCurator(input: CuratorRunInput, actorId: string): Promise<MemoryMigrationDto> {
    const state = await loadState()
    if (!state.backupId) throw new DomainError(409, "Gere o backup antes de rodar o curador", "MIGRATION_NO_BACKUP")
    assertIdle(state, ["backup", "triage", "compact", "import"])
    runInBackground("triage", async () => {
        const { memorySettings } = await import("@/features/ai/server/memory-settings")
        const settings = await memorySettings()
        const current = await loadState()
        const pending = current.items.filter((item) => !item.imported)
        const groups = new Map<string, IMigrationItem[]>()
        for (const item of pending) groups.set(groupKey(item), [...(groups.get(groupKey(item)) ?? []), item])
        const instructions = buildCuratorInstructions(settings.categories, settings.textMax)
        const decisions = new Map<string, NonNullable<IMigrationItem["decision"]>>()
        const decided = new Set(pending.filter((item) => item.decision).map((item) => item.sourceId))
        let done = 0
        let chunks = 0
        let failed = 0
        let lastError = ""
        for (const items of groups.values()) {
            const sources = items.map(sourceOf)
            const summaries = sources.map((item) => ({ id: item.id, resumo: item.resumo || item.texto.slice(0, 120), createdAt: item.createdAt }))
            const channel = channelOfSource(sources[0]) ?? sources[0].list
            for (let start = 0; start < sources.length; start += CURATOR_CHUNK) {
                const chunk = sources.slice(start, start + CURATOR_CHUNK)
                const rules = { categories: settings.categories, textMax: settings.textMax }
                chunks++
                try {
                    const answers = parseCuratorAnswer(await askCurator(input, instructions, buildCuratorPrompt(chunk[0].list, chunk, summaries, channel), chunk[0].list, curatorTimeoutMs))
                    for (const [id, decision] of applyCuratorRules(chunk, answers, rules)) decisions.set(id, decision)
                } catch (error) {
                    // Bloco que falha: a decisão e a revisão anteriores ficam como estavam; a memória ainda sem
                    // decisão vai para a revisão do dono com o erro real no motivo.
                    failed++
                    lastError = messageOf(error)
                    engramindLog.warn({ list: chunk[0].list, err: lastError }, "[engramind] curador falhou num bloco: decisões anteriores preservadas")
                    for (const [id, decision] of applyCuratorRules(chunk, [], rules)) {
                        if (!decided.has(id)) decisions.set(id, { ...decision, motivo: `Curador indisponível: ${lastError}` })
                    }
                }
                done += chunk.length
                await setStep("triage", { progress: { done, total: pending.length } })
            }
        }
        // Todos os blocos falharam: a etapa falha com o erro real e nada do que já foi decidido é trocado.
        if (chunks > 0 && failed === chunks) throw new Error(`O curador não classificou nenhuma memória: ${lastError}`)
        const latest = await loadState()
        const items = latest.items.map((item) => {
            const decision = decisions.get(item.sourceId)
            if (!decision) return item
            // Nova triagem: a revisão volta a pendente (a não ser que já tenha sido importada).
            return { ...item, decision, review: { status: "pendente" as const, texto: null, categoria: null, at: null } }
        })
        await MemoryMigration.updateOne({ _id: MIGRATION_ID }, { $set: { items, curator: { provider: input.provider, model: input.model, variant: input.variant ?? null, ranAt: new Date() } } })
        const counts = Object.fromEntries(CURATOR_DECISIONS.map((key) => [key, [...decisions.values()].filter((item) => item.decisao === key).length]))
        await auditEngramind(actorId, "migracao", AcaoAuditoria.EXECUTAR, { passo: "curador", provedor: input.provider, modelo: input.model, memorias: decisions.size, blocosComFalha: failed, ...counts })
    })
    return getMigration()
}

/** Segunda passada do curador numa combinação que estoura o orçamento (reescritas curtas e fusões). */
export async function compactCombination(combinationKey: string, actorId: string): Promise<MemoryMigrationDto> {
    const state = await loadState()
    assertIdle(state, ["triage", "compact", "import"])
    if (!state.curator) throw new DomainError(409, "Rode o curador antes de compactar", "MIGRATION_NO_TRIAGE")
    const budgets = await budgetOf(state)
    const combo = budgets.find((item) => item.key === combinationKey)
    if (!combo) throw new DomainError(404, "Combinação não encontrada", "MIGRATION_COMBINATION_NOT_FOUND")
    const curator = { provider: state.curator.provider as CuratorRunInput["provider"], model: state.curator.model, variant: state.curator.variant }
    runInBackground("compact", async () => {
        const { memorySettings } = await import("@/features/ai/server/memory-settings")
        const settings = await memorySettings()
        const current = await loadState()
        const items = current.items.filter((item) => !item.imported && item.channel && combo.channels.includes(item.channel) && included(item))
        const sources = items.map((item) => ({ ...sourceOf(item), texto: finalOf(item).texto }))
        const answers = parseCuratorAnswer(await askCurator(curator, buildCompactInstructions(combo.budget), buildCuratorPrompt("compactacao", sources, [], combo.channels.join(", ")), `compactar ${combo.key}`, curatorTimeoutMs))
        const decisions = applyCuratorRules(sources, answers, { categories: settings.categories, textMax: settings.textMax })
        const latest = await loadState()
        const next = latest.items.map((item) => {
            const decision = decisions.get(item.sourceId)
            if (!decision || item.imported) return item
            return { ...item, decision, review: { status: "pendente" as const, texto: null, categoria: null, at: null } }
        })
        await MemoryMigration.updateOne({ _id: MIGRATION_ID }, { $set: { items: next } })
        await auditEngramind(actorId, "migracao", AcaoAuditoria.EXECUTAR, { passo: "compactar", combinacao: combo.key, memorias: decisions.size })
    })
    return getMigration()
}

// ── Etapa 3: revisão ────────────────────────────────────────────────────────

const needsAttention = (item: IMigrationItem) => item.decision?.decisao === "descartar" || item.decision?.decisao === "revisar_dono"

function finalOf(item: IMigrationItem): { texto: string; categoria: string | null } {
    const proposed = item.decision?.decisao === "migrar_reescrevendo" || (item.decision?.decisao === "revisar_dono" && item.decision.textoProposto) ? item.decision?.textoProposto : null
    return { texto: item.review.texto ?? proposed ?? item.texto, categoria: item.review.categoria ?? item.decision?.categoriaProposta ?? null }
}

/** Entra na estimativa: aprovada, ou ainda pendente com proposta de migrar. */
function included(item: IMigrationItem): boolean {
    if (item.review.status === "rejeitada") return false
    if (item.review.status === "aprovada") return true
    return item.decision?.decisao === "migrar" || item.decision?.decisao === "migrar_reescrevendo"
}

async function fits(item: IMigrationItem, texto: string): Promise<boolean> {
    const { memoryLimitsFor } = await import("@/features/ai/server/memory-settings")
    const limits = await memoryLimitsFor(item.channel)
    return texto.length <= limits.textMax && texto.trim().length >= limits.textMin
}

async function assertFits(item: IMigrationItem, texto: string): Promise<void> {
    const { memoryLimitsFor } = await import("@/features/ai/server/memory-settings")
    const limits = await memoryLimitsFor(item.channel)
    if (texto.length > limits.textMax) throw new DomainError(400, `A memória ${item.sourceId} tem ${texto.length} caracteres: reescreva em até ${limits.textMax} antes de aprovar`, "MIGRATION_TEXT_TOO_LONG")
    if (texto.trim().length < limits.textMin) throw new DomainError(400, `A memória ${item.sourceId} ficou curta demais`, "MIGRATION_TEXT_TOO_SHORT")
}

export async function reviewItems(input: MigrationItemPatch, actorId: string): Promise<MemoryMigrationDto> {
    const state = await loadState()
    assertIdle(state, ["triage", "compact", "import"])
    const patches = new Map(input.items.map((item) => [item.id, item]))
    const items: IMigrationItem[] = []
    for (const item of state.items) {
        const patch = patches.get(item.sourceId)
        if (!patch) {
            items.push(item)
            continue
        }
        if (!item.decision) throw new DomainError(409, "Rode o curador antes de revisar", "MIGRATION_NO_TRIAGE")
        const review = { ...item.review, at: new Date() }
        if (patch.texto !== undefined) review.texto = patch.texto?.trim() || null
        if (patch.categoria !== undefined) review.categoria = patch.categoria ?? null
        if (patch.status) review.status = patch.status
        const next = { ...item, review }
        if (review.status === "aprovada") await assertFits(next, finalOf(next).texto)
        items.push(next)
    }
    await MemoryMigration.updateOne({ _id: MIGRATION_ID }, { $set: { items } })
    await auditEngramind(actorId, "migracao", AcaoAuditoria.ATUALIZAR, { passo: "revisao", memorias: input.items.map((item) => ({ id: item.id, status: item.status ?? null, editada: item.texto !== undefined })) })
    await publish()
    return getMigration()
}

/**
 * Decisão em lote de uma lista. Sem `includeAttention`, só as que o curador mandou migrar; com ele, também
 * as de revisão do dono. `descartar` nunca é aprovada em lote: migrar uma descartada é ação item a item
 * ("Migrar mesmo assim").
 */
export async function reviewBulk(input: MigrationBulkInput, actorId: string): Promise<MemoryMigrationDto> {
    const state = await loadState()
    const eligible = (item: IMigrationItem) => {
        if (!needsAttention(item)) return true
        if (input.status === "aprovada" && item.decision?.decisao === "descartar") return false
        return Boolean(input.includeAttention)
    }
    const candidates = state.items.filter((item) => item.list === input.list && (item.centralId ?? null) === (input.centralId ?? null) && item.decision && !item.imported && eligible(item))
    // Aprovar em lote pula a memória cujo texto final não cabe nos limites (fica pendente para editar).
    const targets: IMigrationItem[] = []
    for (const item of candidates) {
        if (input.status === "aprovada" && !(await fits(item, finalOf(item).texto))) continue
        targets.push(item)
    }
    if (!targets.length) return getMigration()
    return reviewItems({ items: targets.map((item) => ({ id: item.sourceId, status: input.status })) }, actorId)
}

// ── Etapa 4: importação ─────────────────────────────────────────────────────


export async function importApproved(actorId: string): Promise<MemoryMigrationDto> {
    const state = await loadState()
    assertIdle(state, ["backup", "triage", "compact", "import"])
    const approved = state.items.filter((item) => item.review.status === "aprovada" && !item.imported)
    if (!approved.length) throw new DomainError(409, "Nenhuma memória aprovada para importar", "MIGRATION_NOTHING_APPROVED")
    runInBackground("import", async () => {
        const { ensureAgentMemoryNetwork, ensureMemoryChannel } = await import("./memory-network")
        const { memorySettings } = await import("@/features/ai/server/memory-settings")
        const network = await ensureAgentMemoryNetwork(actorId)
        if (network.step.status === "failed") throw new Error(network.step.message)
        const settings = await memorySettings()
        const byChannel = new Map<string, IMigrationItem[]>()
        for (const item of approved) {
            // Sempre o canal da lista de origem (o curador não move memórias de lista).
            const channel = item.channel
            if (!channel) continue
            byChannel.set(channel, [...(byChannel.get(channel) ?? []), item])
        }
        let done = 0
        let created = 0
        let duplicates = 0
        const importedAt = new Date()
        for (const [channel, items] of byChannel) {
            if (channel.startsWith(`${AI_AGENTS["developer-central"].channel}/`)) await ensureMemoryChannel(channel, `Memórias da central · ${channel.split("/").pop()}`, AI_AGENTS["developer-central"].description)
            for (let start = 0; start < items.length; start += settings.maxBatch) {
                const batch = items.slice(start, start + settings.maxBatch)
                const memories = batch.map((item) => {
                    const final = finalOf(item)
                    return {
                        text: final.texto,
                        ...(final.categoria ? { category: final.categoria } : {}),
                        created_at: new Date(item.createdAt).toISOString(),
                        status: "active" as const,
                        author: { app: "opex" },
                        origin: item.origin ?? { source: "dono", label: "Dono" },
                    }
                })
                const key = importIdempotencyKey({ channel, memories })
                const result = await engramindCall<ImportResult>("POST", { path: "/v1/memories/import", body: { channel, memories } }, { idempotencyKey: key })
                const ids = new Map<number, { id: string; duplicate: boolean }>()
                for (const item of result?.created ?? []) ids.set(item.index, { id: item.id, duplicate: false })
                for (const item of result?.duplicates ?? []) ids.set(item.index, { id: item.existing_id, duplicate: true })
                created += result?.created?.length ?? 0
                duplicates += result?.duplicates?.length ?? 0
                const marks = new Map(batch.map((item, index) => [item.sourceId, ids.get(index)]))
                const latest = await loadState()
                const next = latest.items.map((item) => {
                    const mark = marks.get(item.sourceId)
                    return mark ? { ...item, imported: { engramindId: mark.id, key, at: importedAt, duplicate: mark.duplicate } } : item
                })
                await MemoryMigration.updateOne({ _id: MIGRATION_ID }, { $set: { items: next } })
                done += batch.length
                await setStep("import", { progress: { done, total: approved.length } })
            }
        }
        const latest = await loadState()
        await MemoryMigration.updateOne({ _id: MIGRATION_ID }, { $set: { lastImportAt: new Date(), ...(latest.firstCompletedAt ? {} : { firstCompletedAt: new Date() }) } })
        await auditEngramind(actorId, "migracao", AcaoAuditoria.EXECUTAR, { passo: "importacao", aprovadas: approved.length, criadas: created, duplicadas: duplicates, canais: [...byChannel.keys()] })
        engramindLog.info({ created, duplicates }, "[engramind] memórias dos agentes importadas")
    })
    return getMigration()
}

// ── Leitura ─────────────────────────────────────────────────────────────────

async function budgetOf(state: IMemoryMigration) {
    const entries = state.items.filter((item) => item.channel && included(item)).map((item) => ({ channel: item.channel!, text: finalOf(item).texto }))
    const centrals = [...new Set(state.items.map((item) => item.centralId).filter((value): value is string => Boolean(value)))]
    let budget = 4000
    try {
        budget = (await (await import("@/features/ai/server/memory-settings")).memorySettings()).budgetTokens
    } catch {
        // Sem o Engramind, a estimativa usa o padrão.
    }
    return estimateBudgets(entries, budgetCombinations(centrals), budget)
}

const stepDto = (step: IMigrationStep): MigrationStepDto => ({ status: step.status, error: step.error, startedAt: iso(step.startedAt), finishedAt: iso(step.finishedAt), progress: step.progress })
const emptyCounts = () => Object.fromEntries(CURATOR_DECISIONS.map((key) => [key, 0])) as Record<CuratorDecision, number>

function itemDto(item: IMigrationItem): MigrationItemDto {
    return {
        id: item.sourceId,
        list: item.list,
        listTitle: isAiAgentId(item.list) ? AI_AGENTS[item.list].title : item.list,
        centralId: item.centralId,
        texto: item.texto,
        resumo: item.resumo,
        origem: item.origin?.label ?? "Dono",
        ownerProtected: item.ownerProtected,
        channel: item.channel,
        criadaEm: new Date(item.createdAt).toISOString(),
        decision: item.decision,
        review: { status: item.review.status, texto: item.review.texto, categoria: item.review.categoria },
        final: finalOf(item),
        needsAttention: needsAttention(item),
        imported: item.imported ? { engramindId: item.imported.engramindId, at: new Date(item.imported.at).toISOString(), duplicate: item.imported.duplicate } : null,
    }
}

export async function getMigration(): Promise<MemoryMigrationDto> {
    const state = await loadState()
    const backup = state.backupId ? await MemoryBackup.findById(state.backupId).select({ json: 0 }).lean() : null
    const triaged = state.items.filter((item) => item.decision)
    const byList = new Map<string, MemoryMigrationDto["report"] extends infer R ? (R extends { byList: (infer L)[] } ? L : never) : never>()
    const byDecision = emptyCounts()
    for (const item of triaged) {
        byDecision[item.decision!.decisao]++
        const key = groupKey(item)
        const row = byList.get(key) ?? { list: item.list, centralId: item.centralId, title: isAiAgentId(item.list) ? AI_AGENTS[item.list].title : item.list, total: 0, counts: emptyCounts() }
        row.total++
        row.counts[item.decision!.decisao]++
        byList.set(key, row)
    }
    return {
        legacyCount: await legacyMemoryCount().catch(() => state.items.length),
        backup: backup ? { id: backup._id, createdAt: new Date(backup.createdAt).toISOString(), count: backup.count, sha256: backup.sha256 } : null,
        steps: { backup: stepDto(state.steps.backup), triage: stepDto(state.steps.triage), compact: stepDto(state.steps.compact), import: stepDto(state.steps.import) },
        curator: state.curator ? { provider: state.curator.provider, model: state.curator.model, variant: state.curator.variant, ranAt: new Date(state.curator.ranAt).toISOString() } : null,
        items: state.items.map(itemDto),
        report: triaged.length ? { byDecision, byList: [...byList.values()] } : null,
        budget: triaged.length ? await budgetOf(state) : [],
        firstCompletedAt: iso(state.firstCompletedAt),
        lastImportAt: iso(state.lastImportAt),
    }
}

/** Testes: zera as etapas em andamento deste processo. */
export function resetMigrationRuntimeForTests(): void {
    running.clear()
}
