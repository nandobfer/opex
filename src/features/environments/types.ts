import type { EnvironmentSource, EnvironmentsSettings, Machine } from "./schemas"

export type DeployStatus = "running" | "success" | "failed"
export type DeployKind = "deploy" | "move" | "delete"

export interface ServiceStatusDto {
    service: string
    container: string
    state: string
    status: string
    ports: string
    cpu: string | null
    memory: string | null
    /** Versão do `package.json` do app no container (`null` = sem o arquivo ou parado). */
    version: string | null
}

export interface EnvironmentDeploySummaryDto {
    id: string
    kind: DeployKind
    status: DeployStatus
    ref: string | null
    commit: string | null
    buildOn: Machine
    runOn: Machine
    error: string | null
    startedAt: string
    finishedAt: string | null
    /** Duração (`null` enquanto em andamento). */
    durationMs: number | null
    version: string | null
    skipBuild: boolean
    /** Retomado depois de o app reiniciar no meio do deploy. */
    resumed: boolean
}

export interface EnvironmentDto {
    id: string
    name: string
    slug: string
    source: EnvironmentSource
    /** Só os nomes das variáveis extras (os valores ficam cifrados no servidor). */
    envKeys: string[]
    ports: number[]
    healthUrl: string | null
    buildOn: Machine
    runOn: Machine
    /** Onde está no ar (último deploy com sucesso); `null` = nunca implantado. */
    deployedOn: { buildOn: Machine; runOn: Machine } | null
    /** Versão do código do último deploy com sucesso. */
    deployedVersion: string | null
    lastDeploy: EnvironmentDeploySummaryDto | null
    /** Serviços em execução (snapshot na hora da consulta). */
    services: ServiceStatusDto[]
    createdAt: string
    updatedAt: string
}

export interface UnmanagedProjectDto {
    machine: Machine
    projectName: string
    workingDir: string | null
    configFiles: string[]
    git: boolean
    containers: number
    running: number
}

export interface EnvironmentsListDto {
    items: EnvironmentDto[]
    unmanaged: UnmanagedProjectDto[]
    /** Túnel do Builder Machine aberto (o PC está alcançável). */
    pcAvailable: boolean
    pcReason: string | null
    checkedAt: string
}

export interface EnvironmentDeployDto extends EnvironmentDeploySummaryDto {
    environmentId: string
    log: string
}

/** Linha do NDJSON do log ao vivo. */
export type DeployEvent = { type: "log"; text: string } | { type: "status"; status: DeployStatus; error: string | null }

export interface EnvironmentsSettingsDto {
    settings: EnvironmentsSettings
    isDefault: boolean
}

export interface RegistryStatusDto {
    running: boolean
    port: number
    detail: string
}

/**
 * Ambiente visto no **portal do cliente** (só os de central cujo repositório está vinculado ao
 * cliente). Sem variáveis, máquinas, caminhos, portas, containers nem log: só o estado.
 */
export interface PortalEnvironmentDto {
    id: string
    name: string
    slug: string
    /** Ref (branch/tag) que o ambiente implanta. */
    ref: string
    health: "running" | "partial" | "stopped" | "never"
    /** Versão do código no ar (último deploy com sucesso). */
    deployedVersion: string | null
    services: { service: string; state: string; status: string; version: string | null }[]
    lastDeploy: { status: DeployStatus; startedAt: string; finishedAt: string | null; durationMs: number | null; version: string | null } | null
    /** Há um deploy em andamento (as ações ficam bloqueadas). */
    deploying: boolean
}
