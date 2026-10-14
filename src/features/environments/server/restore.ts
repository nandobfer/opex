import { logger } from "@/lib/logger"
import { DomainError } from "@/lib/api/route"
import { recordAudit, AcaoAuditoria } from "@/lib/audit/record"
import { Environment } from "@/lib/db/models/Environment"
import { EnvironmentOperation } from "@/lib/db/models/EnvironmentOperation"
import { checkRestoreCompatibility } from "../logic"
import { ENVIRONMENT_OPERATION_AUDIT_ENTITY } from "../constants"
import type { EnvironmentActor } from "./actor"
import { assertCanOperate } from "./actor"
import { loadEnvironmentRuntime } from "./context"
import { buildComposeOverride, composeUp, inferContainerPort, listProjectImages } from "./docker"
import { inspectEnvironmentStatus } from "./containers"
import { writeHostFile } from "./host-files"
import { fetchComposeFile } from "./compose"
import { environmentLogger } from "./logs"
import { claimOperation, createOperation, finishOperation, operationDto, patchStep, renewLease } from "./operations"
import { publishEnvironmentsUpdated, publishOperationEvent } from "./realtime"
import { findImageMetadata, loadImageMetadata, mergeImageMetadata } from "./images"
import type { EnvironmentImageDto, OperationDto, RestoreInput } from "../types"

/**
 * Restauração de um ambiente para uma imagem específica, com bloqueio por **compatibilidade de
 * schema**: compara o schema **registrado no Opex** para o ambiente com o esperado pela imagem. Não
 * há leitura do banco do ambiente — o registro vem das publicações bem-sucedidas.
 */

const LEASE_OWNER = `${process.pid}:${Date.now()}:restore`

export async function listEnvironmentImages(envId: string): Promise<EnvironmentImageDto[]> {
    const runtime = await loadEnvironmentRuntime(envId)
    const [hostImages, metadata] = await Promise.all([
        listProjectImages(runtime.host, runtime.invocation.projectName, { cwd: runtime.directory }),
        loadImageMetadata(String(runtime.env._id)),
    ])
    return mergeImageMetadata(hostImages, metadata)
}

export async function startRestore(actor: EnvironmentActor, envId: string, input: RestoreInput): Promise<OperationDto> {
    const runtime = await loadEnvironmentRuntime(envId)
    assertCanOperate(actor, runtime.env.projectId)

    const metadata = await findImageMetadata(String(runtime.env._id), input.imageId)
    const compatibility = checkRestoreCompatibility({
        appliedVersion: runtime.env.appliedDbVersion ?? null,
        imageVersion: metadata?.dbVersion ?? null,
        origin: metadata?.origin ?? "unknown",
        confirmUnverified: input.confirmUnverified,
    })
    if (compatibility.level === "blocked") throw new DomainError(409, compatibility.message, "DB_VERSION_MISMATCH")
    if (!compatibility.allowed) throw new DomainError(409, compatibility.message, "RESTORE_CONFIRMATION_REQUIRED")

    const operation = await createOperation({
        environmentId: String(runtime.env._id),
        projectId: runtime.env.projectId,
        type: "restore",
        method: "local",
        userId: actor.userId,
        imageId: input.imageId,
        configSnapshot: {
            imageId: input.imageId,
            imageTag: metadata?.tag ?? null,
            composeFile: runtime.invocation.composeFile,
            projectName: runtime.projectName,
            service: runtime.env.composeService || null,
            publishedPort: runtime.env.publishedPort ?? null,
        },
    })
    await Environment.updateOne({ _id: runtime.env._id }, { $set: { lastOperationId: String(operation._id) } })
    await recordAudit({
        userId: actor.userId,
        entidade: ENVIRONMENT_OPERATION_AUDIT_ENTITY,
        entidadeId: String(operation._id),
        acao: AcaoAuditoria.EXECUTAR,
        depois: { type: "restore", imageId: input.imageId, environmentId: String(runtime.env._id) },
    })
    void runRestoreOperation(String(operation._id), LEASE_OWNER)
    return operationDto(operation, null)
}

export async function runRestoreOperation(operationId: string, owner: string): Promise<void> {
    const claimed = await claimOperation(operationId, owner)
    if (!claimed) return
    const runtime = await loadEnvironmentRuntime(claimed.environmentId)
    const log = environmentLogger({ environmentId: claimed.environmentId, scope: "restore", secrets: runtime.secrets })
    const service = runtime.env.composeService || runtime.invocation.projectName
    const imageRef = claimed.imageId ?? ""
    try {
        await patchStep(operationId, "check", { status: "running" })
        {
            const current = await EnvironmentOperation.findById(operationId).lean()
            if (current) await publishOperationEvent(current)
        }
        // Revalida o schema registrado imediatamente antes de restaurar.
        const metadata = await findImageMetadata(claimed.environmentId, imageRef)
        const compatibility = checkRestoreCompatibility({
            appliedVersion: runtime.env.appliedDbVersion ?? null,
            imageVersion: metadata?.dbVersion ?? null,
            origin: metadata?.origin ?? "unknown",
            confirmUnverified: true,
        })
        if (compatibility.level === "blocked") throw new DomainError(409, compatibility.message, "DB_VERSION_MISMATCH")
        log.info(`Restaurando imagem ${metadata?.tag ?? imageRef}`)
        await patchStep(operationId, "check", { status: "done", message: metadata?.tag ?? imageRef })

        await patchStep(operationId, "up", { status: "running" })
        await renewLease(operationId, owner)
        const compose = await fetchComposeFile(runtime.project.repo, runtime.env.branch, runtime.invocation.composeFile).catch(() => null)
        const containerPort = compose ? inferContainerPort(compose.summary, runtime.env.composeService || null) : null
        await writeHostFile(runtime.host, runtime.overrideFile, buildComposeOverride({
            service: runtime.env.composeService || service,
            image: metadata?.tag ?? imageRef,
            publishedPort: runtime.env.publishedPort,
            containerPort,
            cpus: runtime.env.resources.cpus,
            memoryMb: runtime.env.resources.memoryMb,
        }))
        const upResult = await composeUp(runtime.host, runtime.invocation, { cwd: runtime.directory, service: runtime.env.composeService || null })
        if (upResult.exitCode !== 0) throw new DomainError(502, `Falha ao recriar os containers: ${upResult.output.slice(0, 400)}`, "UP_FAILED")
        await inspectEnvironmentStatus(runtime)
        await patchStep(operationId, "up", { status: "done" })
        // Restaurar uma imagem **não reduz** o schema registrado: o banco não é revertido junto.
        await finishOperation(operationId, "done", "Restaurado. O schema do banco permanece o registrado.")
        log.success("Restauração concluída.")
    } catch (error) {
        logger.error({ err: error, operationId }, "[environments] Restauração falhou")
        await finishOperation(operationId, "failed", error instanceof Error ? error.message : String(error))
        const doc = await EnvironmentOperation.findById(operationId).lean()
        if (doc) await publishOperationEvent(doc)
    } finally {
        await publishEnvironmentsUpdated(claimed.projectId, "restore")
    }
}
