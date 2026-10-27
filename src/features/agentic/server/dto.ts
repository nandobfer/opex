import type { IAgenticCentral, IAgenticWorkbench } from "@/lib/db/models/Agentic"
import type { OpencodeFormDto, OpencodePermissionDto } from "@/lib/ai/opencode-events"
import { PENDING_TURN_ACTIONS, WORKBENCH_STAGES, RUN_STATES, type PendingTurnAction, type RunState, type WorkbenchStage } from "../constants"
import { parseCentralConfig, asAgenticFlow } from "../logic"
import { asReconnectOutcome } from "../reconnect"
import type { CentralDto, SlotQueueDto, WorkbenchDto, WorkbenchSummaryDto } from "../types"

const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null)

export const asStage = (value: string): WorkbenchStage => (WORKBENCH_STAGES as readonly string[]).includes(value) ? (value as WorkbenchStage) : "plan_review"
export const asRunState = (value: string): RunState => (RUN_STATES as readonly string[]).includes(value) ? (value as RunState) : "idle"

const asPendingAction = (value: unknown): PendingTurnAction => ((PENDING_TURN_ACTIONS as readonly unknown[]).includes(value) ? (value as PendingTurnAction) : "implement")

/** Espera por vaga da mesa (`null` sem `pendingTurn`). */
export function toSlotQueue(pendingTurn: Pick<IAgenticWorkbench, "pendingTurn">["pendingTurn"] | undefined, position: number | null): SlotQueueDto | null {
    return pendingTurn ? { position, action: asPendingAction(pendingTurn.action) } : null
}

export function toCentralDto(
    doc: Pick<IAgenticCentral, "_id" | "projectId" | "projectName" | "config" | "lastTest" | "createdAt" | "updatedAt">,
    extra: { repo: { repo: string; repoUrl: string; sigla: string } | null; active: number; running: number },
): CentralDto {
    return {
        id: String(doc._id),
        projectId: doc.projectId,
        projectName: doc.projectName,
        sigla: extra.repo?.sigla ?? "",
        config: parseCentralConfig(doc.config),
        repo: extra.repo?.repo ?? null,
        repoUrl: extra.repo?.repoUrl ?? null,
        lastTest: doc.lastTest ? { at: new Date(doc.lastTest.at).toISOString(), ok: doc.lastTest.ok, message: doc.lastTest.message } : null,
        activeWorkbenches: extra.active,
        runningWorkbenches: extra.running,
        createdAt: new Date(doc.createdAt).toISOString(),
        updatedAt: new Date(doc.updatedAt).toISOString(),
    }
}

export function toWorkbenchDto(doc: IAgenticWorkbench, buildQueuePosition: number | null = null, slotQueuePosition: number | null = null, models: WorkbenchDto["models"] = null, liveChat = false, adversarial = false): WorkbenchDto {
    return {
        id: String(doc._id),
        centralId: doc.centralId,
        taskId: doc.taskId,
        taskCode: doc.taskCode,
        taskTitle: doc.taskTitle,
        stage: asStage(doc.stage),
        runState: asRunState(doc.runState),
        error: doc.error ?? null,
        sessionId: doc.sessionId ?? null,
        sessionDirectory: doc.sessionDirectory ?? null,
        branch: doc.branch ?? null,
        worktreePath: doc.worktreePath ?? null,
        port: doc.port ?? null,
        previewUrl: doc.previewUrl ?? null,
        previewHealthy: doc.previewHealthy ?? null,
        agenticFlow: asAgenticFlow(doc.agenticFlow),
        deletionRequestedAt: iso(doc.deletionRequestedAt),
        buildQueuePosition,
        slotQueue: toSlotQueue(doc.pendingTurn, slotQueuePosition),
        plans: (doc.plans ?? []).map((plan) => ({ version: plan.version, text: plan.text, feedback: plan.feedback ?? null, createdAt: new Date(plan.createdAt).toISOString() })),
        pr: doc.pr ? { number: doc.pr.number, url: doc.pr.url, state: doc.pr.state, mergedAt: iso(doc.pr.mergedAt) } : null,
        pendingPermissions: (doc.pendingPermissions ?? []) as OpencodePermissionDto[],
        pendingForms: (doc.pendingForms ?? []) as OpencodeFormDto[],
        usage: { costUsd: doc.usage?.costUsd ?? 0, inputTokens: doc.usage?.inputTokens ?? 0, outputTokens: doc.usage?.outputTokens ?? 0, reasoningTokens: doc.usage?.reasoningTokens ?? 0 },
        lastStage: doc.lastStage ? asStage(doc.lastStage) : null,
        turnStartedAt: iso(doc.turnStartedAt),
        stoppedByUser: Boolean(doc.stopRequestedAt),
        forksDonePrompt: doc.forksDonePrompt ? { count: doc.forksDonePrompt.count, at: new Date(doc.forksDonePrompt.at).toISOString() } : null,
        models,
        liveChat,
        adversarial,
        reconnect: doc.reconnect ? { outcome: asReconnectOutcome(doc.reconnect.outcome) ?? "transient", message: doc.reconnect.message ?? null, at: new Date(doc.reconnect.at).toISOString() } : null,
        startedAt: new Date(doc.startedAt).toISOString(),
        completedAt: iso(doc.completedAt),
        updatedAt: new Date(doc.updatedAt).toISOString(),
    }
}

export function toWorkbenchSummary(
    doc: Pick<IAgenticWorkbench, "_id" | "taskId" | "taskCode" | "taskTitle" | "stage" | "runState" | "pendingPermissions" | "pendingForms" | "updatedAt"> & Partial<Pick<IAgenticWorkbench, "pendingTurn" | "forksDonePrompt">>,
    buildQueuePosition: number | null = null,
    slotQueuePosition: number | null = null,
): WorkbenchSummaryDto {
    return {
        id: String(doc._id),
        taskId: doc.taskId,
        taskCode: doc.taskCode,
        taskTitle: doc.taskTitle,
        stage: asStage(doc.stage),
        runState: asRunState(doc.runState),
        buildQueuePosition,
        slotQueue: toSlotQueue(doc.pendingTurn, slotQueuePosition),
        pendingPermissions: doc.pendingPermissions?.length ?? 0,
        pendingForms: doc.pendingForms?.length ?? 0,
        forksDonePrompt: Boolean(doc.forksDonePrompt),
        updatedAt: new Date(doc.updatedAt).toISOString(),
    }
}
