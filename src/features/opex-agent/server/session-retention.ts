import type { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { OpexJob, OpexSession, type IOpexSession, type OpexAgentKind } from "@/lib/db/models/Opex"
import { getLocalUser } from "@/lib/local-user"
import { loggerFor } from "@/lib/logger"
import { agentAuditEntity } from "../constants"
import { isTurnActive } from "./hub"
import { opexDb, publishSessionUpdated, purgeSession } from "./sessions"

/**
 * Limpeza das sessões dos agentes (Agente Opex e Agente Maddox) sem interação há X dias — rotinas
 * `opex-agent-sessions-cleanup` e `maddox-agent-sessions-cleanup`. Vale para o dono e o portal.
 *
 * - Sessão **não arquivada** com a última mensagem antes do corte → **arquivada** (`archivedAt` = agora).
 * - Sessão **arquivada** com a última atividade (mensagem ou arquivamento) antes do corte → **excluída**
 *   de vez (`purgeSession`). A carência conta do arquivamento: a sessão fica pelo menos X dias arquivada.
 *   Arquivadas antes do campo `archivedAt` usam o `updatedAt`.
 * - Nunca toca sessão respondendo ou aguardando confirmação, com turno vivo neste processo nem
 *   vinculada a um job do agente ainda ativo (agendado, executando ou aguardando confirmação).
 */

const log = loggerFor({ module: "agent-session-retention" })
const DAY_MS = 24 * 60 * 60 * 1000
/** Teto por execução de cada etapa (arquivar / excluir); o restante fica para a próxima. */
export const AGENT_SESSION_CLEANUP_BATCH = 200
const IDLE_STATUSES = ["idle", "error"] as const
const ACTIVE_JOB_STATUSES = ["scheduled", "running", "awaiting_confirmation"] as const

type SessionDoc = IOpexSession & { _id: Types.ObjectId }

export interface AgentSessionCleanupResult {
    archived: number
    deleted: number
    failed: number
}

export function retentionCutoff(days: number, now: Date): Date {
    return new Date(now.getTime() - days * DAY_MS)
}

function agentFilter(agent: OpexAgentKind): Record<string, unknown> {
    // Sessões antigas sem o campo `agent` são do Agente Opex.
    return agent === "maddox" ? { agent: "maddox" } : { agent: { $ne: "maddox" } }
}

/** Sessões vinculadas a jobs ainda ativos do agente (não podem sumir debaixo do job). */
async function sessionsWithActiveJobs(): Promise<Set<string>> {
    const jobs = await OpexJob.find({ status: { $in: ACTIVE_JOB_STATUSES } })
        .select({ sessionId: 1, originSessionId: 1, resultSessionId: 1 })
        .lean<{ sessionId: Types.ObjectId | null; originSessionId: Types.ObjectId | null; resultSessionId: Types.ObjectId | null }[]>()
    const ids = new Set<string>()
    for (const job of jobs) for (const id of [job.sessionId, job.originSessionId, job.resultSessionId]) if (id) ids.add(String(id))
    return ids
}

/** Arquivada e parada desde antes do corte? (mensagem e arquivamento; sem `archivedAt`, o `updatedAt`). */
export function archivedIdleSince(doc: Pick<IOpexSession, "lastMessageAt" | "archivedAt" | "updatedAt" | "createdAt">): Date {
    const times = [doc.lastMessageAt, doc.archivedAt ?? doc.updatedAt, doc.createdAt].map((value) => (value ? new Date(value).getTime() : 0))
    return new Date(Math.max(...times))
}

export async function cleanupIdleAgentSessions(agent: OpexAgentKind, days: number, now: Date = new Date()): Promise<AgentSessionCleanupResult> {
    await opexDb()
    const cutoff = retentionCutoff(days, now)
    const protectedIds = await sessionsWithActiveJobs()
    const actor = getLocalUser().id
    const result: AgentSessionCleanupResult = { archived: 0, deleted: 0, failed: 0 }
    const eligible = (doc: SessionDoc) => !protectedIds.has(doc._id.toString()) && !isTurnActive(doc._id.toString())

    // 1) Excluir as arquivadas paradas (antes de arquivar, para a recém-arquivada não entrar no mesmo passe).
    const archived = await OpexSession.find({
        ...agentFilter(agent),
        archived: true,
        status: { $in: IDLE_STATUSES },
        lastMessageAt: { $lte: cutoff },
        $or: [{ archivedAt: { $lte: cutoff } }, { archivedAt: null, updatedAt: { $lte: cutoff } }],
    })
        .sort({ lastMessageAt: 1 })
        .limit(AGENT_SESSION_CLEANUP_BATCH)
        .lean<SessionDoc[]>()
    for (const doc of archived) {
        if (!eligible(doc) || archivedIdleSince(doc) > cutoff) continue
        try {
            await purgeSession(doc, actor, { motivo: "inatividade", diasSemInteracao: days })
            result.deleted += 1
        } catch (error) {
            result.failed += 1
            log.warn({ err: error, sessionId: doc._id.toString(), agent }, "[agent-session-retention] Falha ao excluir a sessão arquivada")
        }
    }

    // 2) Arquivar as ativas paradas.
    const idle = await OpexSession.find({ ...agentFilter(agent), archived: { $ne: true }, status: { $in: IDLE_STATUSES }, lastMessageAt: { $lte: cutoff } })
        .sort({ lastMessageAt: 1 })
        .limit(AGENT_SESSION_CLEANUP_BATCH)
        .lean<SessionDoc[]>()
    for (const doc of idle) {
        if (!eligible(doc)) continue
        const id = doc._id.toString()
        try {
            // A condição é reconferida na gravação: um turno novo no meio do caminho tira a sessão da limpeza.
            const updated = await OpexSession.updateOne(
                { _id: doc._id, archived: { $ne: true }, status: { $in: IDLE_STATUSES }, lastMessageAt: { $lte: cutoff } },
                { $set: { archived: true, archivedAt: now } },
            )
            if (!updated.modifiedCount) continue
            await recordAudit({
                userId: actor,
                entidade: agentAuditEntity(doc.agent ?? "opex"),
                entidadeId: id,
                acao: AcaoAuditoria.ATUALIZAR,
                antes: { titulo: doc.title, arquivada: false },
                depois: { titulo: doc.title, arquivada: true, motivo: "inatividade", diasSemInteracao: days },
            })
            await publishSessionUpdated(id)
            result.archived += 1
        } catch (error) {
            result.failed += 1
            log.warn({ err: error, sessionId: id, agent }, "[agent-session-retention] Falha ao arquivar a sessão")
        }
    }

    log.info({ agent, days, ...result }, "[agent-session-retention] Limpeza das sessões concluída")
    return result
}

/** Resumo da execução para o estado da rotina. */
export function describeAgentSessionCleanup(result: AgentSessionCleanupResult): string {
    if (!result.archived && !result.deleted && !result.failed) return "Nenhuma sessão sem interação"
    return [
        result.archived ? `${result.archived} sessão(ões) arquivada(s)` : null,
        result.deleted ? `${result.deleted} sessão(ões) arquivada(s) excluída(s)` : null,
        result.failed ? `${result.failed} com falha (nova tentativa na próxima execução)` : null,
    ]
        .filter(Boolean)
        .join("; ")
}
