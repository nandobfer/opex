import type { TaskPriority, TaskStatus, TaskType } from "./constants"

/** Referência com nome (produto, pacote, pessoa). */
export interface NamedRef {
    id: string
    name: string
}

export interface PersonRef extends NamedRef {
    email: string | null
}

export interface WorkPackageRef extends NamedRef {
    startDate: string | null
    endDate: string | null
}

/** Tarefa como o quadro e a tabela usam (normalizada da resposta do Go! Sipal). */
export interface TaskDto {
    id: string
    /** Código sequencial (ex.: `GO-DEV-123`). */
    code: string
    title: string
    status: TaskStatus
    order: number
    taskType: TaskType | null
    priority: TaskPriority
    product: NamedRef | null
    workPackage: WorkPackageRef | null
    assignee: PersonRef | null
    commitUrl: string | null
    pullRequestUrl: string | null
    archived: boolean
    createdAt: string | null
    updatedAt: string | null
    /** Coluna customizada (status pessoal) em que a tarefa está; `null` = coluna do Go! Sipal. */
    localColumn?: string | null
    /** Ordem dentro da coluna customizada. */
    localOrder?: number | null
    /** Rascunho criado de uma issue do GitHub (ainda não está no Go! Sipal). */
    draft?: TaskDraftRef | null
    /** Issue do GitHub vinculada (botão "Abrir issue"). */
    issue?: TaskIssueRef | null
}

export interface TaskDraftRef {
    /** Id do rascunho (sem o prefixo `draft-`). */
    id: string
    repo: string
    number: number
    /** A issue foi fechada antes do envio. */
    issueClosed: boolean
}

export interface TaskIssueRef {
    url: string
    repo: string
    number: number
    state: "open" | "closed"
    /** Aviso da integração (ex.: issue fechada aguardando commit). */
    notice: string | null
}

/** Tarefa que saiu da coluna customizada porque o status mudou no Go! Sipal. */
export interface ReturnedTask {
    id: string
    code: string
    status: TaskStatus
    columnName: string | null
}

export interface TaskComment {
    id: string
    content: string
    author: PersonRef | null
    createdAt: string | null
}

export interface TaskHistoryEntry {
    id: string
    action: string
    description: string
    performedBy: NamedRef | null
    createdAt: string | null
}

export interface TaskTimeLog {
    id: string
    user: PersonRef | null
    startTime: string | null
    endTime: string | null
    /** Minutos. */
    duration: number | null
    description: string | null
    active: boolean
}

export interface TaskAttachment {
    id: string
    name: string
    size: number | null
    createdAt: string | null
}

export interface TaskImplementationPlan {
    steps: string[]
    complexity: "low" | "medium" | "high" | null
    relatedFiles: string[]
    generatedAt: string | null
    generatedBy: NamedRef | null
}

/** Tarefa completa (página da tarefa). */
export interface TaskDetailDto extends TaskDto {
    description: string | null
    technicalSpec: string | null
    businessContext: string | null
    acceptanceCriteria: string[]
    createdBy: NamedRef | null
    linkedRequest: { code: string; title: string | null } | null
    linkedImprovement: { code: string; title: string | null } | null
    implementationPlan: TaskImplementationPlan | null
    comments: TaskComment[]
    history: TaskHistoryEntry[]
    attachments: TaskAttachment[]
    timeLogs: TaskTimeLog[]
    /** Minutos apontados no total. */
    totalTimeLogged: number
    /** Link para abrir a tarefa no Go! Sipal. */
    platformUrl: string
}

export interface TaskListDto {
    tasks: TaskDto[]
    /** URL da plataforma (links "Abrir no Go! Sipal"). */
    baseUrl: string
    /** Usuário da sessão (para destacar "minhas tarefas"). */
    currentUserId: string | null
    fetchedAt: string
    /** Saíram de colunas customizadas nesta leitura (status mudou no Go! Sipal). */
    returned?: ReturnedTask[]
}

/** Opções dos filtros. Pacotes de trabalho saem das próprias tarefas (a plataforma só lista por produto). */
export interface TaskOptionsDto {
    products: NamedRef[]
    developers: PersonRef[]
    /** Usuário da sessão Go! Sipal ("Atribuir a mim"). */
    currentUserId: string | null
}

/** Payload do evento `tasks-updated`. */
export interface TasksUpdatedEvent {
    ids: string[]
}
