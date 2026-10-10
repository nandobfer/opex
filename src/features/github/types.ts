import type { GithubPriorityRule, GithubTypeRule } from "./schemas"

export interface GithubSyncResultDto {
    at: string
    ok: boolean
    message: string
}

/** Vínculo repositório ↔ Opex (o repositório é o Projeto). */
export interface GithubLinkDto {
    id: string
    repo: string
    repoUrl: string
    name: string
    sigla: string
    entryColumnKey: string
    /** `null` = a coluna não existe mais. */
    entryColumnName: string | null
    /** Coluna de conclusão ↔ issue fechada (ver `closedColumnName`). */
    closedColumnKey: string | null
    closedColumnName: string | null
    enabled: boolean
    initialImportAt: string | null
    lastSync: GithubSyncResultDto | null
    /** Tarefas criadas a partir das issues deste repositório. */
    taskCount: number
}

export interface GithubRepoOption {
    fullName: string
    htmlUrl: string
    description: string | null
    private: boolean
    ownerAvatarUrl: string | null
}

export interface GithubLabelOption {
    name: string
    color: string | null
    repos: string[]
}

export interface GithubMappingDto {
    typeRules: GithubTypeRule[]
    priorityRules: GithubPriorityRule[]
    /** Ainda não salvo: valores iniciais do código. */
    isDefault: boolean
}

export interface GithubSyncStatusDto {
    job: { lastRunAt: string | null; lastFinishedAt: string | null; lastStatus: "ok" | "error" | null; lastError: string | null; nextRunAt: string | null; enabled: boolean } | null
    links: { id: string; repo: string; enabled: boolean; lastSync: GithubSyncResultDto | null; initialImportAt: string | null }[]
}
