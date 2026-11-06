import { Types } from "mongoose"
import { isInvalidRoutineOpexProvider } from "../schemas"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { routineIdentityOf } from "@/features/ai/agents"
import { RoutineAgent, type IRoutineAgent, type IRoutineRun } from "@/lib/db/models/RoutineAgent"
import {
    ROUTINE_AGENT_AUDIT_ENTITY,
    ROUTINE_AGENT_UPDATED_EVENT,
    ROUTINE_RUN_ATTENTION_EVENT,
    ROUTINE_RUN_AUDIT_ENTITY,
    ROUTINE_RUN_UPDATED_EVENT,
    routineChannelOf,
} from "../constants"
import type { RoutineAgentDto, RoutinePendingActionDto, RoutineRunDto } from "../types"
import type { RoutineRunAttentionPayload, RoutineRunUpdatedPayload } from "../types"
import type { RoutineRunStatus } from "../status"
import { routineAgentTitle } from "../identity-plan"

/** Infra comum do servidor dos agentes rotineiros (OPE-130): log, banco, auditoria, eventos e DTOs. */

export const routineLog = loggerFor({ module: "routine-agents" })

export type RoutineAgentDoc = IRoutineAgent & { _id: Types.ObjectId }
export type RoutineRunDoc = IRoutineRun & { _id: Types.ObjectId }

export async function routineDb(): Promise<void> {
    await dbConnect()
}

export const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function assertObjectId(id: string, kind: "agent" | "run"): void {
    if (!Types.ObjectId.isValid(id)) throw kind === "agent" ? notFoundAgent() : notFoundRun()
}

export const notFoundAgent = () => new DomainError(404, "Agente rotineiro não encontrado", "ROUTINE_AGENT_NOT_FOUND")
export const notFoundRun = () => new DomainError(404, "Execução não encontrada", "ROUTINE_RUN_NOT_FOUND")

export async function loadAgentDoc(id: string): Promise<RoutineAgentDoc> {
    assertObjectId(id, "agent")
    await routineDb()
    const doc = await RoutineAgent.findById(id).lean<RoutineAgentDoc | null>()
    if (!doc) throw notFoundAgent()
    return doc
}

export async function auditAgent(actorId: string, agentId: string, acao: (typeof AcaoAuditoria)[keyof typeof AcaoAuditoria], data: { antes?: Record<string, unknown>; depois?: Record<string, unknown> }): Promise<void> {
    await recordAudit({ userId: actorId, entidade: ROUTINE_AGENT_AUDIT_ENTITY, entidadeId: agentId, acao, ...data })
}

export async function auditRun(actorId: string, runId: string, acao: (typeof AcaoAuditoria)[keyof typeof AcaoAuditoria], depois: Record<string, unknown>): Promise<void> {
    await recordAudit({ userId: actorId, entidade: ROUTINE_RUN_AUDIT_ENTITY, entidadeId: runId, acao, depois })
}

export { AcaoAuditoria }

export async function publishAgentUpdated(id: string): Promise<void> {
    await publishAppEvent(ROUTINE_AGENT_UPDATED_EVENT, { id })
}

export async function publishRunUpdated(payload: RoutineRunUpdatedPayload): Promise<void> {
    await publishAppEvent(ROUTINE_RUN_UPDATED_EVENT, { ...payload })
}

export async function publishRunAttention(payload: RoutineRunAttentionPayload): Promise<void> {
    await publishAppEvent(ROUTINE_RUN_ATTENTION_EVENT, { ...payload })
}

const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null)

export function toAgentDto(doc: RoutineAgentDoc, extra: { lastRun?: RoutineAgentDto["lastRun"]; activeRuns?: number } = {}): RoutineAgentDto {
    const schedule = (doc.triggers ?? []).map((state) => ({ trigger: state.trigger, nextAt: iso(state.nextAt), lastFiredAt: iso(state.lastFiredAt) }))
    const upcoming = schedule
        .map((item) => item.nextAt)
        .filter((value): value is string => Boolean(value))
        .sort()[0]
    return {
        id: String(doc._id),
        name: doc.name ?? "",
        title: routineAgentTitle(doc.name),
        generated: { name: doc.generated?.name === true, objective: doc.generated?.objective === true },
        slug: doc.slug,
        objective: doc.objective ?? "",
        instructions: doc.instructions ?? "",
        engine: doc.engine,
        // D9: provedor gravado antes da regra (ex.: `opencode`) chega vazio, para o editor pedir outro.
        opex: isInvalidRoutineOpexProvider("opex", doc.opex?.provider) ? { ...doc.opex, provider: null, model: "", variant: null } : doc.opex,
        opencode: doc.opencode,
        confirmIrreversible: doc.confirmIrreversible !== false,
        limits: doc.limits,
        triggers: schedule.map((item) => item.trigger),
        schedule,
        status: doc.status,
        provisioning: {
            status: doc.provisioning?.status ?? "pending",
            error: doc.provisioning?.error ?? null,
            at: iso(doc.provisioning?.at),
            channels: doc.provisioning?.channels ?? [],
            extras: doc.provisioning?.extras ?? [],
            blocked: (doc.provisioning?.blocked ?? []).map((item) => ({ channel: item.channel, name: item.name, at: new Date(item.at).toISOString() })),
            warnings: doc.provisioning?.warnings ?? [],
            steps: doc.provisioning?.steps ?? { agent: false, token: false, channels: false, extras: false, workdir: false },
        },
        webhookEnabled: (doc.triggers ?? []).some((state) => state.trigger.kind === "webhook" && state.trigger.enabled),
        workdir: doc.workdir ?? null,
        engramindAgent: `opex/${routineIdentityOf(doc.slug)}`,
        channel: routineChannelOf(doc.slug),
        lastRun: extra.lastRun ?? null,
        nextFireAt: doc.status === "active" ? (upcoming ?? null) : null,
        activeRuns: extra.activeRuns ?? 0,
        createdAt: new Date(doc.createdAt).toISOString(),
        updatedAt: new Date(doc.updatedAt).toISOString(),
    }
}

function pendingDto(run: RoutineRunDoc): RoutinePendingActionDto | null {
    const action = run.pendingAction
    if (!action) return null
    return {
        id: action.id,
        summary: action.summary,
        kind: action.kind,
        toolLabel: action.toolLabel ?? null,
        input: action.displayInput ?? null,
        requestedAt: new Date(action.requestedAt).toISOString(),
        resolvedAt: iso(action.resolvedAt),
        resolution: action.resolution ?? null,
    }
}

export function toRunDto(run: RoutineRunDoc, agentName: string): RoutineRunDto {
    const snapshot = run.snapshot
    return {
        id: String(run._id),
        agentId: String(run.agentId),
        agentName,
        seq: run.seq,
        status: run.status,
        origin: run.origin,
        request: run.request ?? null,
        hasPayload: run.payload !== null && run.payload !== undefined,
        engine: snapshot.engine,
        model: snapshot.engine === "opex" ? snapshot.opex.model || null : snapshot.opencode.model || null,
        queuedAt: new Date(run.queuedAt).toISOString(),
        startedAt: iso(run.startedAt),
        finishedAt: iso(run.finishedAt),
        activeMs: run.activeMs ?? 0,
        waitingMs: run.waitingMs ?? 0,
        tokens: run.tokens ?? 0,
        costUsd: run.costUsd ?? null,
        costPartial: run.costPartial === true,
        hibernation: run.hibernation ? { at: new Date(run.hibernation.at).toISOString(), reason: run.hibernation.reason } : null,
        pendingAction: pendingDto(run),
        report: run.report ?? null,
        error: run.error ?? null,
        warnings: run.warnings ?? [],
        delayMs: run.delayMs ?? null,
    }
}

export async function emitRunChange(run: Pick<RoutineRunDoc, "_id" | "agentId">, status: RoutineRunStatus): Promise<void> {
    await publishRunUpdated({ id: String(run._id), agentId: String(run.agentId), status })
}
