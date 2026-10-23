import type { TaskAgenticFlow, TaskPriority, TaskType } from "./constants"

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
    /** Fluxo da mesa de trabalho escolhido na tela de desenvolvimento; `null` = segue o padrão da central (OPE-79). */
    agenticFlow: TaskAgenticFlow | null
}

export interface TaskIssueRef {
    url: string
    repo: string
    number: number
    state: "open" | "closed"
    /** Aviso da integração. */
    notice: string | null
}

/** Textos da tarefa em que dá para comentar uma linha (`comment` = corpo de outro comentário). */
export type LineCommentField = "description" | "technicalSpec" | "comment"

/** Linha comentada (marcador oculto no fim do comentário). */
export interface TaskLineRef {
    field: LineCommentField
    /** Comentário comentado (só `field: "comment"`). */
    commentId: string | null
    /** Linha no texto-fonte quando o comentário foi feito. */
    line: number
    /** `lineHash` do texto da linha. */
    hash: string
    /** Citação visível da linha (pode estar cortada; no comentário de trecho, o trecho). */
    quote: string
    /** Comentário de trecho: texto selecionado (como aparece na tela), linhas cobertas e ocorrência. */
    selection: TaskLineSelection | null
}

export interface TaskLineSelection {
    text: string
    /** Linhas renderizadas cobertas, terminando na linha âncora (`line`). */
    lines: number
    /** Ocorrência do começo do trecho na primeira linha (0 = primeira). */
    occurrence: number
}

export interface TaskComment {
    id: string
    /** Texto sem o marcador oculto (com a citação, quando é comentário de linha). */
    content: string
    /** Só o que foi escrito (sem a citação nem o marcador). */
    body: string
    lineRef: TaskLineRef | null
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
    /** Cliente de orçamento atribuído à tarefa (`null` = sem cliente e sem estimativa). */
    clientId: string | null
    description: string | null
    technicalSpec: string | null
    comments: TaskComment[]
    history: TaskHistoryEntry[]
    timeLogs: TaskTimeLog[]
    /** Minutos apontados no total. */
    totalTimeLogged: number
    /** Nome do cliente de orçamento que originou a tarefa (só quando há estimativa). */
    estimateClientName: string | null
    /** Anexos confirmados da tarefa (contador da aba Anexos). */
    attachmentsCount: number
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
