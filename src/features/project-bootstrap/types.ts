import type { OpencodeFormDto, OpencodePermissionDto } from "@/lib/ai/opencode-events"
import type { AiFeatureAvailability } from "@/features/ai/types"
import type { ReconnectOutcome } from "@/features/agentic/reconnect"
import type { ProjectBootstrapStatus, ProjectBootstrapStep } from "./constants"
import type { DirectoryCheck } from "./host-checks"
import type { BootstrapResult, ProjectBootstrapSettings } from "./schemas"
import type { BootstrapPhase } from "./steps"

export type BootstrapMode = "new" | "existing"

export interface BootstrapTechnologyRef {
    name: string
    group: string
}

/** O que o bootstrap já criou (fica mesmo depois de cancelar). */
export interface BootstrapCreatedDto {
    repoUrl: string | null
    projectId: string | null
    centralId: string | null
    environmentId: string | null
    deployId: string | null
    port: number | null
}

export interface BootstrapDeployDto {
    deployId: string
    attempt: number
    status: "running" | "success" | "failed"
    error: string | null
    at: string
}

export interface ProjectBootstrapDto {
    id: string
    repo: string
    owner: string
    name: string
    visibility: "private" | "public"
    mode: BootstrapMode
    branch: string
    directory: string
    context: string
    technologies: BootstrapTechnologyRef[]
    entryColumnKey: string
    closedColumnKey: string | null
    step: ProjectBootstrapStep
    status: ProjectBootstrapStatus
    phase: BootstrapPhase | null
    /** Volta ao agente depois de um deploy com falha soma uma tentativa (começa em 1). */
    attempt: number
    error: string | null
    /** Entregas que faltaram na conferência do fim da etapa 2. */
    missing: string[]
    /** Aviso do estado "aguardando você" (turno encerrado sem o resumo final). */
    notice: string | null
    sessionId: string | null
    /** Há um turno do agente vivo neste processo. */
    running: boolean
    pendingForms: OpencodeFormDto[]
    pendingPermissions: OpencodePermissionDto[]
    reconnect: { outcome: ReconnectOutcome; message: string | null; at: string } | null
    result: BootstrapResult | null
    created: BootstrapCreatedDto
    deploys: BootstrapDeployDto[]
    usage: { costUsd: number; inputTokens: number; outputTokens: number }
    startedAt: string
    updatedAt: string
    finishedAt: string | null
}

export interface ProjectBootstrapSummaryDto {
    id: string
    repo: string
    step: ProjectBootstrapStep
    status: ProjectBootstrapStatus
    phase: BootstrapPhase | null
    attempt: number
    startedAt: string
    updatedAt: string
    finishedAt: string | null
}

export interface ProjectBootstrapSettingsDto {
    settings: ProjectBootstrapSettings
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
}

/** Motivo que bloqueia o envio, com o caminho para resolver. */
export interface BootstrapBlocker {
    message: string
    href: string
    action: string
}

export interface ProjectBootstrapPrefillDto {
    codeRoot: string
    entryColumnKey: string | null
    closedColumnKey: string | null
    blockers: BootstrapBlocker[]
}

export interface RepoOwnerDto {
    login: string
    kind: "user" | "org"
    avatarUrl: string | null
}

export interface RepoOwnersDto {
    viewer: string
    owners: RepoOwnerDto[]
}

export type RepoCheckState = "free" | "existing" | "linked" | "invalid" | "forbidden" | "in-progress"

export interface RepoCheckDto {
    repo: string
    state: RepoCheckState
    message: string
    /** Bloqueia o envio. */
    blocked: boolean
    /** Repositório existente: a branch padrão (vira a ref do ambiente e a base da central). */
    defaultBranch: string | null
    private: boolean | null
    /** Bootstrap em andamento para o mesmo repositório (link). */
    bootstrapId: string | null
}

export type DirectoryCheckDto = DirectoryCheck & { path: string }

export interface TechGroupDto {
    id: string
    name: string
    color: string
    order: number
    count: number
}

export interface TechnologyDto {
    id: string
    name: string
    aliases: string[]
    groupId: string
}

export interface TechCatalogDto {
    groups: TechGroupDto[]
    technologies: TechnologyDto[]
}
