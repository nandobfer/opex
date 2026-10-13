import { dbConnect } from "@/lib/db"
import { EnvironmentOperation, type IEnvironmentOperation, type IEnvironmentOperationStep, type EnvironmentOperationStepStatus } from "@/lib/db/models/EnvironmentOperation"
import { OPERATION_LEASE_MS } from "../constants"
import type { OperationDto } from "../types"
import { toOperationDto } from "./dto"

/**
 * Ciclo de vida **durável** das operações (publicar/restaurar). Persistidas antes da execução, com
 * etapas, tentativa e lease, para sobreviver a fechar a tela e a reinícios do app. Uma operação ativa
 * por ambiente por vez; uma tentativa antiga (lease perdido/`attempt` anterior) nunca promove.
 */

export interface OperationStepSeed {
    id: string
    label: string
}

/** Etapas da publicação pelo Opex (`local`). */
export const PUBLISH_LOCAL_STEPS: readonly OperationStepSeed[] = [
    { id: "git", label: "Clonar/atualizar" },
    { id: "build", label: "Build" },
    { id: "database", label: "Checagem do banco" },
    { id: "up", label: "Subir containers" },
    { id: "healthcheck", label: "Healthcheck" },
]

/** Etapas da publicação pelo CD (GitHub Actions). */
export const PUBLISH_CD_STEPS: readonly OperationStepSeed[] = [
    { id: "dispatch", label: "Disparar workflow" },
    { id: "watch", label: "Acompanhar execução" },
]

/** Etapas da restauração. */
export const RESTORE_STEPS: readonly OperationStepSeed[] = [
    { id: "check", label: "Conferir imagem e banco" },
    { id: "up", label: "Recriar containers" },
]

export function stepsFor(type: "publish" | "restore", method: "local" | "cd" | null): IEnvironmentOperationStep[] {
    const seeds = type === "restore" ? RESTORE_STEPS : method === "cd" ? PUBLISH_CD_STEPS : PUBLISH_LOCAL_STEPS
    return seeds.map((seed) => ({ id: seed.id, label: seed.label, status: "pending", message: null, startedAt: null, finishedAt: null }))
}

const now = () => new Date()

export interface CreateOperationInput {
    environmentId: string
    projectId: string
    type: "publish" | "restore"
    method: "local" | "cd" | null
    configSnapshot: Record<string, unknown>
    attempt?: number
    imageId?: string | null
    userId: string
}

/** Cria a operação (status `queued`). Bloqueia se já houver uma ativa (queued/running) no ambiente. */
export async function createOperation(input: CreateOperationInput): Promise<IEnvironmentOperation> {
    await dbConnect()
    const active = await EnvironmentOperation.findOne({ environmentId: input.environmentId, status: { $in: ["queued", "running"] } })
        .select({ _id: 1 })
        .lean()
    if (active) {
        const { DomainError } = await import("@/lib/api/route")
        throw new DomainError(409, "Já existe uma operação em andamento neste ambiente.", "OPERATION_IN_PROGRESS")
    }
    const created = await EnvironmentOperation.create({
        environmentId: input.environmentId,
        projectId: input.projectId,
        type: input.type,
        method: input.method,
        status: "queued",
        attempt: input.attempt ?? 1,
        steps: stepsFor(input.type, input.method),
        message: null,
        configSnapshot: input.configSnapshot,
        commitSha: null,
        imageId: input.imageId ?? null,
        runId: null,
        runUrl: null,
        lease: null,
        startedAt: null,
        finishedAt: null,
    })
    created.set("_auditContext", { userId: input.userId })
    await created.save()
    return created.toObject() as IEnvironmentOperation
}

/** Reivindica a operação para execução: marca `running`, inicia o lease e conta a tentativa. */
export async function claimOperation(id: string, owner: string): Promise<IEnvironmentOperation | null> {
    await dbConnect()
    const expiresAt = new Date(Date.now() + OPERATION_LEASE_MS)
    return EnvironmentOperation.findOneAndUpdate(
        { _id: id, status: { $in: ["queued", "running"] } },
        { $set: { status: "running", startedAt: now(), lease: { owner, expiresAt } } },
        { new: true },
    ).lean()
}

/** Renova o lease (heartbeat de uma execução viva). */
export async function renewLease(id: string, owner: string): Promise<void> {
    await dbConnect()
    await EnvironmentOperation.updateOne(
        { _id: id, "lease.owner": owner },
        { $set: { "lease.expiresAt": new Date(Date.now() + OPERATION_LEASE_MS) } },
    )
}

interface StepPatch {
    status: EnvironmentOperationStepStatus
    message?: string | null
}

/** Atualiza o estado de uma etapa (append/atualização idempotente pelo id). */
export async function patchStep(id: string, stepId: string, patch: StepPatch): Promise<IEnvironmentOperation | null> {
    await dbConnect()
    const operation = await EnvironmentOperation.findById(id)
    if (!operation) return null
    const step = operation.steps.find((item) => item.id === stepId)
    if (!step) return operation.toObject() as IEnvironmentOperation
    step.status = patch.status
    if (patch.message !== undefined) step.message = patch.message
    if (patch.status === "running") step.startedAt = now()
    if (patch.status === "done" || patch.status === "failed" || patch.status === "skipped") {
        step.finishedAt = now()
        if (!step.startedAt) step.startedAt = step.finishedAt
    }
    await operation.save()
    return operation.toObject() as IEnvironmentOperation
}

export async function finishOperation(id: string, status: "done" | "failed" | "cancelled", message: string | null = null): Promise<IEnvironmentOperation | null> {
    await dbConnect()
    return EnvironmentOperation.findOneAndUpdate(
        { _id: id },
        { $set: { status, message, finishedAt: now(), lease: null } },
        { new: true },
    ).lean()
}

export async function findOperation(id: string): Promise<IEnvironmentOperation | null> {
    await dbConnect()
    return EnvironmentOperation.findById(id).lean()
}

export async function findLatestOperation(environmentId: string): Promise<IEnvironmentOperation | null> {
    await dbConnect()
    return EnvironmentOperation.findOne({ environmentId }).sort({ createdAt: -1 }).lean()
}

export async function listOperations(environmentId: string, limit = 20): Promise<IEnvironmentOperation[]> {
    await dbConnect()
    return EnvironmentOperation.find({ environmentId }).sort({ createdAt: -1 }).limit(Math.min(limit, 100)).lean()
}

/** Operações órfãs (running com lease vencido): usadas pela reconciliação. */
export async function findStaleOperations(): Promise<IEnvironmentOperation[]> {
    await dbConnect()
    return EnvironmentOperation.find({ status: "running", "lease.expiresAt": { $lt: now() } }).lean()
}

export function operationDto(operation: IEnvironmentOperation, queuePosition: number | null = null): OperationDto {
    const dto = toOperationDto(operation)
    dto.queuePosition = queuePosition
    return dto
}
