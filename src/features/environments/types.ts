import type { AgentResult, EnvironmentInput, RepoConfigInput } from "./schemas"

export interface RepoOption {
    id: string
    name: string
    repo: string
}
export interface EnvironmentDto extends Omit<EnvironmentInput, "variables"> {
    id: string
    projectId: string
    revision: number
    dbVersion: string | null
    observedAt: string | null
    variables: { name: string; value: string; secret: boolean; configured?: boolean }[]
    compose: AgentResult["compose"]
    activeOperationId: string | null
}
export interface RepoConfigDto {
    config: RepoConfigInput
    revision: number
    secretsConfigured: boolean
    canEdit: boolean
    canManageSecrets: boolean
}
export interface OperationDto {
    id: string
    environmentId: string
    kind: string
    state: string
    stage: string
    steps: { name: string; at: string }[]
    error: string | null
    createdAt: string
    finishedAt: string | null
    sessionId: string | null
    evidence: string[]
    migrations: string[]
    runUrl: string | null
}
export interface ImageDto {
    id: string
    version: string
    dbVersion: string | null
    builtAt: string | null
    origin: string
    images: AgentResult["images"]
}
export interface EnvironmentDetail {
    environment: EnvironmentDto
    operations: OperationDto[]
    images: ImageDto[]
    canEdit: boolean
    canManageSecrets: boolean
}
