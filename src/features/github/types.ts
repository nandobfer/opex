import type { TaskPriority, TaskType } from "@/features/tasks/constants"
import type { NamedRef, PersonRef, WorkPackageRef } from "@/features/tasks/types"
import type { GithubPriorityRule, GithubTypeRule } from "./schemas"

export interface GithubSyncResultDto {
    at: string
    ok: boolean
    message: string
}

export interface GithubRepoLinkDto {
    id: string
    repo: string
    repoUrl: string
    productId: string
    productName: string
    authors: string[]
    entryColumnKey: string
    /** `null` = a coluna não existe mais. */
    entryColumnName: string | null
    defaultType: TaskType
    defaultPriority: TaskPriority
    enabled: boolean
    initialImportAt: string | null
    lastSync: GithubSyncResultDto | null
    /** Rascunhos ainda não enviados nem descartados. */
    pendingDrafts: number
}

export interface GithubRepoOption {
    fullName: string
    htmlUrl: string
    description: string | null
    private: boolean
    ownerAvatarUrl: string | null
}

export interface GithubUserOption {
    login: string
    name: string | null
    avatarUrl: string | null
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

export interface GithubPersonDto {
    login: string
    name: string | null
    avatarUrl: string | null
    email: string | null
    developerId: string | null
    developerName: string | null
    suggestion: { developerId: string; developerName: string; reason: string } | null
    repos: string[]
}

export interface GithubSyncStatusDto {
    job: { lastRunAt: string | null; lastFinishedAt: string | null; lastStatus: "ok" | "error" | null; lastError: string | null; nextRunAt: string | null; enabled: boolean } | null
    links: { id: string; repo: string; enabled: boolean; lastSync: GithubSyncResultDto | null; initialImportAt: string | null }[]
}

export interface DiscardedDraftDto {
    id: string
    code: string
    repo: string
    number: number
    title: string
    issueUrl: string
    productName: string
    discardedAt: string | null
}

export interface DraftCommentDto {
    id: string
    author: GithubUserOption | null
    body: string
    createdAt: string | null
}

export type DraftState = "draft" | "sending" | "sent" | "discarded"

/** Rascunho completo (página do rascunho). */
export interface TaskDraftDetailDto {
    /** Id da tarefa no quadro (`draft-…`). */
    id: string
    code: string
    repo: string
    number: number
    issueUrl: string
    author: GithubUserOption & { developerName: string | null }
    issueState: "open" | "closed"
    issueStateReason: string | null
    labels: string[]
    issueType: string | null
    milestone: string | null
    assignees: string[]
    title: string
    body: string
    issueTitle: string
    issueBody: string
    /** Corpo com as imagens trocadas por URLs assinadas (prévia). */
    previewBody: string
    product: NamedRef
    taskType: TaskType
    priority: TaskPriority
    assignee: PersonRef | null
    workPackage: Pick<WorkPackageRef, "id" | "name"> | null
    /** De onde veio cada campo mapeado. */
    origins: Record<string, string>
    edited: string[]
    columnKey: string
    columnName: string | null
    state: DraftState
    goTaskId: string | null
    goTaskCode: string | null
    images: { total: number; attached: number } | null
    imageCount: number
    comments: DraftCommentDto[]
    workPackages: Pick<WorkPackageRef, "id" | "name">[]
    issueCreatedAt: string | null
    updatedAt: string | null
}

export interface SendDraftResultDto {
    taskId: string
    code: string
    images: { total: number; attached: number }
    commented: boolean
}
