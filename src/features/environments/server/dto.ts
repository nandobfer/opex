import { decryptSecret, isEncryptedSecret, type EncryptedSecret } from "@/lib/crypto/secretBox"
import type { IEnvironment, IEnvironmentStatus } from "@/lib/db/models/Environment"
import type { IEnvironmentOperation } from "@/lib/db/models/EnvironmentOperation"
import type { EnvironmentDto, EnvironmentStatus, OperationDto, SecretStatus, EnvironmentRepoSecretsStatus } from "../types"

/**
 * Conversores das entidades para DTOs. Garantem que **nenhum segredo** saia pela API: variáveis
 * marcadas como secretas só aparecem para o dono, e os campos cifrados viram apenas `configured`/
 * `unreadable`.
 */

function toIso(date: Date | null | undefined): string | null {
    return date ? new Date(date).toISOString() : null
}

export function secretStatus(box: EncryptedSecret | null | undefined): SecretStatus {
    if (!isEncryptedSecret(box)) return { configured: false, unreadable: false }
    try {
        decryptSecret(box)
        return { configured: true, unreadable: false }
    } catch {
        return { configured: true, unreadable: true }
    }
}

export function emptySecretsStatus(): EnvironmentRepoSecretsStatus {
    return {
        sshPassword: { configured: false, unreadable: false },
        sshPrivateKey: { configured: false, unreadable: false },
        sshPassphrase: { configured: false, unreadable: false },
    }
}

function toStatus(status: IEnvironmentStatus | undefined): EnvironmentStatus {
    return {
        containers: (status?.containers ?? []).map((container) => ({ ...container })),
        running: Boolean(status?.running),
        partial: Boolean(status?.partial),
        reachable: Boolean(status?.reachable),
        error: status?.error ?? null,
        checkedAt: toIso(status?.checkedAt ?? null),
    }
}

export function toOperationDto(operation: IEnvironmentOperation): OperationDto {
    return {
        id: String(operation._id ?? (operation as unknown as { id?: string }).id ?? ""),
        environmentId: operation.environmentId,
        type: operation.type,
        method: operation.method,
        status: operation.status,
        queuePosition: null,
        steps: (operation.steps ?? []).map((step) => ({
            id: step.id,
            label: step.label,
            status: step.status,
            message: step.message,
            startedAt: toIso(step.startedAt),
            finishedAt: toIso(step.finishedAt),
        })),
        message: operation.message,
        runUrl: operation.runUrl,
        startedAt: toIso(operation.startedAt),
        finishedAt: toIso(operation.finishedAt),
        createdAt: toIso(operation.createdAt) ?? new Date().toISOString(),
    }
}

export function toEnvironmentDto(env: IEnvironment & { _id: unknown }): EnvironmentDto {
    return {
        id: String(env._id),
        projectId: env.projectId,
        name: env.name,
        slug: env.slug,
        branch: env.branch,
        hostDirectory: env.hostDirectory,
        composeFile: env.composeFile,
        composeService: env.composeService,
        composeProject: env.composeProject ?? "",
        envFile: env.envFile ?? ".env",
        publishedPort: env.publishedPort ?? null,
        resources: { cpus: env.resources?.cpus ?? null, memoryMb: env.resources?.memoryMb ?? null },
        healthcheck: {
            enabled: env.healthcheck?.enabled ?? true,
            path: env.healthcheck?.path ?? "/",
            timeoutMs: env.healthcheck?.timeoutMs ?? 60_000,
        },
        dbVersionSource: { kind: env.dbVersionSource?.kind ?? "file", value: env.dbVersionSource?.value ?? "" },
        dbVersion: env.dbVersion ?? null,
        appliedDbVersion: env.appliedDbVersion ?? null,
        appliedDbVersionAt: toIso(env.appliedDbVersionAt ?? null),
        status: toStatus(env.status),
        lastOperation: null,
        createdAt: toIso(env.createdAt) ?? new Date().toISOString(),
        updatedAt: toIso(env.updatedAt) ?? new Date().toISOString(),
    }
}
