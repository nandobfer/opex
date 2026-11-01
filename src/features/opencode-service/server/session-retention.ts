import type { SessionInfo } from "@opencode/client"
import { AdversarialReview, adversarialDb } from "@/features/adversarial-agent/server/models"
import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import { removeOpencodeSessionSafe } from "@/lib/ai/opencode-sessions"
import { dbConnect } from "@/lib/db"
import { AgenticFork, AgenticWorkbench } from "@/lib/db/models/Agentic"
import { OpexSession } from "@/lib/db/models/Opex"
import { PrReview } from "@/lib/db/models/PrReview"
import { TaskRefinement } from "@/lib/db/models/Refinement"
import { loggerFor } from "@/lib/logger"

/**
 * Rotina `opencode-sessions-cleanup`: exclui do servidor OpenCode as sessões sem interação há X dias —
 * TODAS as do servidor (inclusive as pessoais do dono no TUI/desktop), menos as protegidas:
 *
 * - vinculadas a registros do Opex: mesa (`AgenticWorkbench.sessionId`), fork, refinamento (e a skill
 *   ativa), revisão de PR, rodada do Agente Adversário e sessão do Agente Maddox (arquivada ou não);
 * - em execução agora (`session.active()`).
 *
 * A decisão é por **árvore** (sessão raiz + subsessões `parentID`): a árvore só sai quando nenhuma
 * sessão dela está protegida e a última atividade de todas é anterior ao corte; exclui-se a raiz.
 * Última atividade = `max(time.updated, time.created)`.
 */

const log = loggerFor({ module: "opencode-session-retention" })
const DAY_MS = 24 * 60 * 60 * 1000
const PAGE_SIZE = 200
/** Teto de sessões lidas por execução (todas as páginas somadas). */
export const OPENCODE_SESSION_SCAN_LIMIT = 5_000
/** Teto de exclusões por execução; o restante fica para a próxima (lease de 15 min do agendador). */
export const OPENCODE_SESSION_DELETE_LIMIT = 200
/** Prazo de cada leitura no OpenCode (`session.list`, `project.list`, `session.active`). */
export const OPENCODE_SESSION_REQUEST_TIMEOUT_MS = 30_000
/** Orçamento total da rotina, abaixo do lease de 15 min do agendador: passado o prazo, as exclusões param. */
export const OPENCODE_SESSION_CLEANUP_BUDGET_MS = 10 * 60_000

export interface OpencodeSessionCleanupOptions {
    requestTimeoutMs?: number
    budgetMs?: number
}

export interface OpencodeSessionCleanupResult {
    scanned: number
    deleted: number
    protected: number
    failed: number
    /** A leitura parou no teto `OPENCODE_SESSION_SCAN_LIMIT` (há mais sessões no servidor). */
    truncated: boolean
    /** As exclusões pararam no orçamento de tempo (o restante fica para a próxima execução). */
    outOfTime: boolean
}

type SessionLite = Pick<SessionInfo, "id" | "parentID" | "time">

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0

/** Ids de sessões do OpenCode referenciadas por registros do Opex (nunca podem ser excluídas pela limpeza). */
export async function collectProtectedOpencodeSessionIds(): Promise<Set<string>> {
    await dbConnect()
    await adversarialDb()
    const notNull = { $nin: [null, ""] }
    const [workbenches, forks, refinements, skills, reviews, adversarial, maddox] = await Promise.all([
        AgenticWorkbench.find({ sessionId: notNull }).select({ sessionId: 1 }).lean<{ sessionId: string | null }[]>(),
        AgenticFork.find({ sessionId: notNull }).select({ sessionId: 1 }).lean<{ sessionId: string | null }[]>(),
        TaskRefinement.find({ sessionId: notNull }).select({ sessionId: 1 }).lean<{ sessionId: string | null }[]>(),
        TaskRefinement.find({ "activeSkill.sessionId": notNull }).select({ activeSkill: 1 }).lean<{ activeSkill: { sessionId: string } | null }[]>(),
        PrReview.find({ sessionId: notNull }).select({ sessionId: 1 }).lean<{ sessionId: string | null }[]>(),
        AdversarialReview.find({ sessionId: notNull }).select({ sessionId: 1 }).lean<{ sessionId: string | null }[]>(),
        OpexSession.find({ opencodeSessionId: notNull }).select({ opencodeSessionId: 1 }).lean<{ opencodeSessionId?: string | null }[]>(),
    ])
    const ids = new Set<string>()
    for (const doc of [...workbenches, ...forks, ...refinements, ...reviews, ...adversarial]) if (isId(doc.sessionId)) ids.add(doc.sessionId)
    for (const doc of skills) if (isId(doc.activeSkill?.sessionId)) ids.add(doc.activeSkill.sessionId)
    for (const doc of maddox) if (isId(doc.opencodeSessionId)) ids.add(doc.opencodeSessionId)
    return ids
}

/**
 * Lê as sessões do servidor, página a página (`cursor`), das mais antigas para as mais recentes
 * (`order: "asc"`), para o teto nunca cortar justamente as candidatas. Além da listagem sem filtro,
 * percorre cada projeto (`project.list`) para não depender de a listagem padrão cobrir todos os
 * projetos; os ids são deduplicados. Cada leitura tem prazo (`signal`); `truncated` = parou no teto.
 */
async function listAllSessions(client: OpencodeClient, timeoutMs: number): Promise<{ sessions: SessionLite[]; truncated: boolean }> {
    const byId = new Map<string, SessionLite>()
    let truncated = false
    const scan = async (filter: { project?: string }) => {
        let cursor: string | undefined
        do {
            if (byId.size >= OPENCODE_SESSION_SCAN_LIMIT) {
                truncated = true
                return
            }
            const page = await client.session.list({ limit: PAGE_SIZE, order: "asc", ...filter, ...(cursor ? { cursor } : {}) }, { signal: AbortSignal.timeout(timeoutMs) })
            for (const session of page.data ?? []) if (!byId.has(session.id)) byId.set(session.id, { id: session.id, parentID: session.parentID, time: session.time })
            const next = page.cursor?.next ?? undefined
            cursor = next && next !== cursor && (page.data?.length ?? 0) > 0 ? next : undefined
        } while (cursor)
    }
    await scan({})
    const projects = await client.project.list({ signal: AbortSignal.timeout(timeoutMs) }).catch((error: unknown) => {
        log.warn({ err: error }, "[opencode-session-retention] Não foi possível listar os projetos do OpenCode; segue só com a listagem padrão")
        return []
    })
    for (const project of projects) await scan({ project: project.id })
    return { sessions: [...byId.values()], truncated }
}

/**
 * Com a leitura cortada no teto, uma subsessão recente pode ter ficado fora da lista: antes de excluir a
 * raiz, confere as subsessões diretas dela (`parentID`). `true` = pode excluir.
 */
async function childrenAllowRemoval(client: OpencodeClient, rootId: string, protectedIds: Set<string>, cutoffMs: number, timeoutMs: number): Promise<boolean> {
    const page = await client.session.list({ limit: PAGE_SIZE, parentID: rootId }, { signal: AbortSignal.timeout(timeoutMs) })
    return (page.data ?? []).every((child) => !protectedIds.has(child.id) && lastActivity(child) <= cutoffMs)
}

const lastActivity = (session: SessionLite) => Math.max(session.time?.updated ?? 0, session.time?.created ?? 0)

/** Raiz da árvore de uma sessão (sobe pelo `parentID` enquanto o pai está na lista; protege contra ciclos). */
function rootOf(session: SessionLite, byId: Map<string, SessionLite>): string {
    let current = session
    const seen = new Set<string>()
    while (current.parentID && byId.has(current.parentID) && !seen.has(current.id)) {
        seen.add(current.id)
        current = byId.get(current.parentID)!
    }
    return current.id
}

/**
 * Decide quais raízes excluir (função pura, testável): árvore inteira parada antes do corte e sem
 * nenhuma sessão protegida (vínculo do Opex ou em execução). Devolve as raízes candidatas (mais antigas
 * primeiro) e quantas árvores paradas ficaram protegidas.
 */
export function planOpencodeSessionCleanup(sessions: SessionLite[], protectedIds: Set<string>, cutoffMs: number): { roots: string[]; protectedTrees: number } {
    const byId = new Map(sessions.map((session) => [session.id, session]))
    const trees = new Map<string, { last: number; protected: boolean }>()
    for (const session of sessions) {
        const root = rootOf(session, byId)
        const tree = trees.get(root) ?? { last: 0, protected: false }
        tree.last = Math.max(tree.last, lastActivity(session))
        if (protectedIds.has(session.id) || (session.parentID && protectedIds.has(session.parentID))) tree.protected = true
        trees.set(root, tree)
    }
    const stale = [...trees.entries()].filter(([, tree]) => tree.last > 0 && tree.last <= cutoffMs)
    return {
        roots: stale.filter(([, tree]) => !tree.protected).sort((a, b) => a[1].last - b[1].last).map(([root]) => root),
        protectedTrees: stale.filter(([, tree]) => tree.protected).length,
    }
}

export async function cleanupIdleOpencodeSessions(days: number, now: Date = new Date(), options: OpencodeSessionCleanupOptions = {}): Promise<OpencodeSessionCleanupResult> {
    const timeoutMs = options.requestTimeoutMs ?? OPENCODE_SESSION_REQUEST_TIMEOUT_MS
    const deadline = Date.now() + (options.budgetMs ?? OPENCODE_SESSION_CLEANUP_BUDGET_MS)
    let client: OpencodeClient
    try {
        client = await getOpencodeClient()
    } catch (error) {
        throw new Error(`OpenCode indisponível para limpar as sessões: ${error instanceof Error ? error.message : String(error)}`)
    }
    const protectedIds = await collectProtectedOpencodeSessionIds()
    let listed: { sessions: SessionLite[]; truncated: boolean }
    let active: Record<string, unknown>
    try {
        listed = await listAllSessions(client, timeoutMs)
        active = (await client.session.active({ signal: AbortSignal.timeout(timeoutMs) })) ?? {}
    } catch (error) {
        throw new Error(`Não foi possível listar as sessões do OpenCode: ${error instanceof Error ? error.message : String(error)}`)
    }
    for (const id of Object.keys(active)) protectedIds.add(id)
    if (listed.truncated) {
        log.warn({ limit: OPENCODE_SESSION_SCAN_LIMIT }, "[opencode-session-retention] Leitura das sessões do OpenCode parou no teto; as mais recentes ficaram para a próxima execução")
    }

    const cutoffMs = now.getTime() - days * DAY_MS
    const plan = planOpencodeSessionCleanup(listed.sessions, protectedIds, cutoffMs)
    const result: OpencodeSessionCleanupResult = { scanned: listed.sessions.length, deleted: 0, protected: plan.protectedTrees, failed: 0, truncated: listed.truncated, outOfTime: false }
    let processed = 0
    for (const sessionId of plan.roots.slice(0, OPENCODE_SESSION_DELETE_LIMIT)) {
        if (Date.now() >= deadline) {
            result.outOfTime = true
            break
        }
        processed += 1
        if (listed.truncated) {
            const allowed = await childrenAllowRemoval(client, sessionId, protectedIds, cutoffMs, timeoutMs).catch((error: unknown) => {
                log.warn({ err: error, sessionId }, "[opencode-session-retention] Não foi possível conferir as subsessões; a sessão fica para a próxima execução")
                return null
            })
            if (allowed === null) {
                result.failed += 1
                continue
            }
            if (!allowed) {
                result.protected += 1
                continue
            }
        }
        if (await removeOpencodeSessionSafe(client, sessionId, log, "opencode-session-retention")) result.deleted += 1
        else result.failed += 1
    }
    if (result.outOfTime) log.warn({ processed, candidates: plan.roots.length }, "[opencode-session-retention] Orçamento de tempo esgotado; o restante fica para a próxima execução")
    log.info({ days, ...result, pending: Math.max(0, plan.roots.length - processed) }, "[opencode-session-retention] Limpeza das sessões do OpenCode concluída")
    return result
}

export function describeOpencodeSessionCleanup(result: OpencodeSessionCleanupResult): string {
    const parts = [
        `${result.deleted} sessão(ões) do OpenCode excluída(s)`,
        result.protected ? `${result.protected} protegida(s) (vinculadas ao Opex ou em execução)` : null,
        result.failed ? `${result.failed} com falha (nova tentativa na próxima execução)` : null,
        result.outOfTime ? "tempo esgotado (o restante fica para a próxima execução)" : null,
    ]
    return `${parts.filter(Boolean).join("; ")} — ${result.scanned} lida(s)${result.truncated ? ` (teto de ${OPENCODE_SESSION_SCAN_LIMIT} atingido; as mais recentes ficam para a próxima)` : ""}`
}
