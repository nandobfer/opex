import type { TaskPriority, TaskType } from "./constants"

/** Referência com nome (projeto). */
export interface NamedRef {
    id: string
    name: string
}

/** Projeto: um repositório GitHub vinculado (ver `lib/db/models/Project.ts`). */
export interface ProjectRef extends NamedRef {
    repo: string
    sigla: string
}

/** Estimativa/orçamento da tarefa (portal do cliente). */
export interface TaskEstimate {
    /** Horas reais estimadas pela IA (visão interna). */
    hours: number
    /** Horas exibidas ao cliente (H × fator). */
    clientHours: number
    /** Faturamento em reais. */
    billingBrl: number
    factor: number
    hourlyRate: number
    model: string | null
    generatedAt: string | null
}

/** Tarefa como o quadro e a tabela usam. */
export interface TaskDto {
    id: string
    /** Código sequencial por projeto (ex.: `OPX-12`). */
    code: string
    columnId: string
    order: number
    title: string
    /** Resumo de 1 linha gerado por IA (substitui a descrição na exibição). */
    summary: string | null
    /** Tags (ids da taxonomia da feature "Tags de tarefas"); vazio quando nenhuma. */
    tags: string[]
    taskType: TaskType | null
    priority: TaskPriority
    archived: boolean
    project: ProjectRef | null
    createdAt: string | null
    updatedAt: string | null
    /** Issue do GitHub vinculada (botão "Abrir issue"). */
    issue?: TaskIssueRef | null
    /** Estimativa/orçamento (portal do cliente) — `null` quando não houver. */
    estimate: TaskEstimate | null
}

export interface TaskIssueRef {
    url: string
    repo: string
    number: number
    state: "open" | "closed"
    /** Aviso da integração. */
    notice: string | null
}

export interface TaskComment {
    id: string
    content: string
    /** Origem do comentário: o dono (app interno) ou o cliente (portal). */
    authorType: "owner" | "client"
    /** Nome exibido do autor (dono: `APP_OWNER_NAME`; cliente: nome do cliente). */
    authorName: string
    createdAt: string | null
}

export interface TaskHistoryEntry {
    id: string
    action: string
    description: string
    createdAt: string | null
}

export interface TaskTimeLog {
    id: string
    startTime: string | null
    endTime: string | null
    /** Minutos. */
    duration: number | null
    description: string | null
    active: boolean
    /** Uso agêntico do período. */
    agent: string | null
    model: string | null
    costUsd: number
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
}

/** Tarefa completa (página da tarefa). */
export interface TaskDetailDto extends TaskDto {
    description: string | null
    technicalSpec: string | null
    comments: TaskComment[]
    history: TaskHistoryEntry[]
    timeLogs: TaskTimeLog[]
    /** Minutos apontados no total. */
    totalTimeLogged: number
    /** Nome do cliente de orçamento que originou a tarefa (só quando há estimativa). */
    estimateClientName: string | null
}

export interface TaskListDto {
    tasks: TaskDto[]
    fetchedAt: string
}

/** Opções dos filtros (projetos). */
export interface TaskOptionsDto {
    projects: ProjectRef[]
}

/** Payload do evento `tasks-updated`. */
export interface TasksUpdatedEvent {
    ids: string[]
}
