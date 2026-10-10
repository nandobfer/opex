import type { TaskPriority, TaskType } from "@/features/tasks/constants"
import type { TaskBoardDto } from "@/features/tasks/board"
import type { ProjectRef, TaskListDto } from "@/features/tasks/types"

/**
 * Repositório do cliente no portal: o projeto (`ProjectRef`) mais os dados do GitHub que o
 * `GithubRepoLabel` exibe (avatar, descrição e privacidade). O portal é público e autentica por
 * token do cliente, então esses dados vêm no próprio DTO (enriquecidos no servidor).
 */
export interface ClienteRepoDto extends ProjectRef {
    ownerAvatarUrl: string | null
    description: string | null
    private: boolean
}

/** Cliente do portal como a tela de administração o exibe (sem o hash; com o caminho do portal). */
export interface ClienteOrcamentoDto {
    id: string
    name: string
    tokenPrefix: string
    /** Caminho relativo do portal com o token (`/cliente?t=…`), para copiar a URL. */
    portalPath: string
    projectIds: string[]
    /** Dados de repositório dos projetos escolhidos (para exibir `owner/repo`). */
    projects: ProjectRef[]
    hourlyRate: number
    profitFactor: number
    active: boolean
    createdAt: string | null
    updatedAt: string | null
}

/** Resposta da criação: inclui o token em claro (aparece uma única vez). */
export interface CreatedClienteOrcamentoDto {
    token: string
    item: ClienteOrcamentoDto
}

/** Prévia estruturada da tarefa (saída validada da IA, sem as horas). */
export interface DraftPreviewDto {
    title: string
    taskType: TaskType | null
    priority: TaskPriority
    technicalSpec: string
    summary: string
}

/** Rascunho do portal (prévia + estado). */
export interface OrcamentoDraftDto {
    id: string
    projectId: string
    projectName: string | null
    /** Repositório escolhido (dados do GitHub inclusos), para exibir no card de metadados. */
    projectRepo: ClienteRepoDto | null
    description: string
    correction: string | null
    preview: DraftPreviewDto | null
    model: string | null
    status: "draft" | "approved"
    taskId: string | null
    /** Estimativa já calculada para exibição (horas reais e do cliente + faturamento). */
    estimate: DraftEstimateDto | null
    createdAt: string | null
}

/** Estimativa exibida no portal (horas com fator e faturamento). */
export interface DraftEstimateDto {
    hours: number
    clientHours: number
    billingBrl: number
}

/** Lista de tarefas do portal (mesmo formato da lista interna). */
export type ClienteTaskListDto = TaskListDto

/** Opções do portal: repositórios permitidos ao cliente e o quadro (colunas). */
export interface ClientePortalOptionsDto {
    clientName: string
    projects: ClienteRepoDto[]
    board: TaskBoardDto
}
