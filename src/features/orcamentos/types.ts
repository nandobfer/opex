import type { TaskPriority, TaskType } from "@/features/tasks/constants"
import type { TaskBoardDto } from "@/features/tasks/board"
import type { ProjectRef, TaskListDto } from "@/features/tasks/types"

/** Cliente do portal como a tela de administração o exibe (sem o token). */
export interface ClienteOrcamentoDto {
    id: string
    name: string
    tokenPrefix: string
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

/** Prévia estruturada da tarefa (saída validada da IA). */
export interface DraftPreviewDto {
    title: string
    taskType: TaskType | null
    priority: TaskPriority
    technicalSpec: string
    summary: string
    estimatedHours: number
}

/** Rascunho do portal (prévia + estado). */
export interface OrcamentoDraftDto {
    id: string
    projectId: string
    projectName: string | null
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
    projects: ProjectRef[]
    board: TaskBoardDto
}
