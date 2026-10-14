import type {
    composeProjectCandidateSchema,
    databaseVersionSourceSchema,
    environmentHealthcheckSchema,
    environmentRepoUpdateSchema,
    environmentResourcesSchema,
    environmentSchema,
    environmentStatusSchema,
    hostEnvFileInputSchema,
    imageDtoSchema,
    operationDtoSchema,
    publishInputSchema,
    restoreInputSchema,
} from "./schemas"
import type { z } from "zod"

/**
 * Tipos do módulo Ambientes. Os contratos que cruzam a API são derivados dos schemas Zod
 * (fonte única para formulário e servidor).
 */

export type EnvironmentRepoUpdateInput = z.infer<typeof environmentRepoUpdateSchema>
export type EnvironmentInput = z.infer<typeof environmentSchema>
export type EnvironmentResources = z.infer<typeof environmentResourcesSchema>
export type EnvironmentHealthcheck = z.infer<typeof environmentHealthcheckSchema>
export type DatabaseVersionSource = z.infer<typeof databaseVersionSourceSchema>
export type PublishInput = z.infer<typeof publishInputSchema>
export type RestoreInput = z.infer<typeof restoreInputSchema>
export type EnvironmentStatus = z.infer<typeof environmentStatusSchema>
export type EnvironmentImageDto = z.infer<typeof imageDtoSchema>
export type OperationDto = z.infer<typeof operationDtoSchema>
export type HostEnvFileInput = z.infer<typeof hostEnvFileInputSchema>
export type ComposeProjectCandidateDto = z.infer<typeof composeProjectCandidateSchema>

/** Fonte de execução do ambiente. */
export type EnvironmentMode = "local" | "remote"

/** Método de autenticação SSH do modo Remoto. */
export type SshAuthMethod = "key" | "password"

/** Campos **públicos** da configuração do repositório (nunca carregam segredos). */
export interface EnvironmentRepoConfigDto {
    projectId: string
    repo: string
    name: string
    mode: EnvironmentMode
    host: string
    sshPort: number
    sshUser: string
    authMethod: SshAuthMethod
    /** Caminho da chave privada no host remoto (alternativa a enviar a chave pelo Opex). */
    sshKeyPath: string
    /** Nome do workflow de CD no GitHub (vazio = a aba CI/CD só lista runs). */
    cdWorkflow: string
    /** Diretório base onde o Opex clona os repositórios no host do ambiente. */
    repositoryDirectory: string
    /** Situação de cada segredo: nunca o valor. */
    secrets: EnvironmentRepoSecretsStatus
    configured: boolean
    updatedAt: string
}

export interface SecretStatus {
    /** Há valor gravado. */
    configured: boolean
    /** Não foi possível descriptografar (chave trocada). */
    unreadable: boolean
}

export interface EnvironmentRepoSecretsStatus {
    sshPassword: SecretStatus
    sshPrivateKey: SecretStatus
    sshPassphrase: SecretStatus
}

/** Ambiente (DTO de leitura). */
export interface EnvironmentDto {
    id: string
    projectId: string
    name: string
    slug: string
    branch: string
    hostDirectory: string
    composeFile: string
    composeService: string
    /** Projeto Compose adotado no host (vazio = derivado do Opex). */
    composeProject: string
    /** Arquivo `.env` do ambiente, relativo ao diretório do repositório. */
    envFile: string
    publishedPort: number | null
    resources: EnvironmentResources
    healthcheck: EnvironmentHealthcheck
    dbVersionSource: DatabaseVersionSource
    /** Schema esperado pela última imagem publicada. `null` = desconhecido. */
    dbVersion: string | null
    /** Schema registrado no Opex como aplicado ao ambiente. */
    appliedDbVersion: string | null
    appliedDbVersionAt: string | null
    status: EnvironmentStatus
    lastOperation: OperationDto | null
    createdAt: string
    updatedAt: string
}

/** Projeto (repositório) disponível para o ator, com o vínculo do GitHub. */
export interface EnvironmentProjectDto {
    id: string
    repo: string
    repoUrl: string
    name: string
    /** O ambiente já tem configuração de repositório? */
    configured: boolean
    environmentCount: number
}

/** Branch real de um repositório (seletor com busca). */
export interface EnvironmentBranchDto {
    name: string
    sha: string | null
    protected: boolean
}

/** Variável do `.env` real do host (valor `null` quando sensível). */
export interface HostEnvEntryDto {
    key: string
    value: string | null
    secret: boolean
}

/** Arquivo `.env` do host, como a tela o vê (nunca o conteúdo bruto). */
export interface HostEnvFileDto {
    path: string
    exists: boolean
    entries: HostEnvEntryDto[]
    /** Revisão do arquivo (evita sobrescrever edição externa). */
    revision: string
    updatedAt: string | null
}

export type EnvironmentLogLevel = "info" | "step" | "success" | "warn" | "error"

/** Linha de log de uma operação/stream de ambiente (formato próprio, distinto do debug das integrações). */
export interface EnvironmentLogLine {
    environmentId: string
    level: EnvironmentLogLevel
    message: string
    /** ISO 8601. */
    ts: string
    /** Serviço do compose (`null` = todos). */
    service?: string | null
    /** Escopo da origem (`publish`, `restore`, `logs`...). */
    scope?: string
    /** Dados estruturados (mascarados). */
    data?: unknown
    instance?: string
}

/** Passo de uma operação (publicar/restaurar). */
export interface OperationStepDto {
    id: string
    label: string
    status: "pending" | "running" | "done" | "failed" | "skipped"
    message: string | null
    startedAt: string | null
    finishedAt: string | null
}
