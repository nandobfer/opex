import type { TaskPriority, TaskType } from "@/features/tasks/constants"
import type { TaskBoardDto } from "@/features/tasks/board"
import type { ProjectRef, TaskComment, TaskDto } from "@/features/tasks/types"
import type { PreviewClarityDto } from "./clarity"

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
    /** Tags (ids da taxonomia) geradas pela feature "Tags de tarefas". */
    tags: string[]
    /**
     * Avaliação de clareza da IA (transitória): presente só no stream da geração; ausente/`null`
     * quando a prévia é lida do rascunho, pois **não** é persistida.
     */
    clarity?: PreviewClarityDto | null
}

/** Tag da taxonomia já resolvida para exibição (id + rótulo). */
export interface DraftTagDto {
    id: string
    label: string
}

/** Rascunho (do portal do cliente ou do dono, em `/tarefas/previa`; prévia + estado). */
export interface OrcamentoDraftDto {
    id: string
    projectId: string
    projectName: string | null
    /** Repositório escolhido (dados do GitHub inclusos), para exibir no card de metadados. */
    projectRepo: ClienteRepoDto | null
    description: string
    correction: string | null
    preview: DraftPreviewDto | null
    /** Tags da prévia já resolvidas (id + rótulo) para exibir na revisão. */
    tags: DraftTagDto[]
    model: string | null
    status: "draft" | "approved"
    taskId: string | null
    /** Estimativa já calculada para exibição (horas reais e do cliente + faturamento). */
    estimate: DraftEstimateDto | null
    /** Cliente escolhido para o custo da estimativa (só no rascunho do dono; portal: `null`). */
    estimateClientId: string | null
    /** Nome do cliente da estimativa (para exibir no seletor do dono). */
    estimateClientName: string | null
    createdAt: string | null
}

/**
 * Estimativa exibida na revisão da prévia. As horas reais (H) vêm sempre; `clientHours`/`billingBrl`
 * são `null` quando nenhum cliente foi escolhido (o dono aproxima o custo escolhendo um cliente).
 */
export interface DraftEstimateDto {
    hours: number
    clientHours: number | null
    billingBrl: number | null
}

/** Estimativa exibida ao cliente: só o que ele pode ver (horas infladas e faturamento). */
export interface ClienteTaskEstimateDto {
    /** Horas exibidas ao cliente (`H × fator`). */
    clientHours: number
    /** Faturamento em reais (`clientHours × custo/hora`). */
    billingBrl: number
}

/**
 * Tarefa na visão do cliente (lista): igual ao `TaskDto` interno, mas a estimativa **não** traz as
 * horas reais, o fator, o custo/hora nem o modelo — o cliente só vê o tempo inflado e o faturamento.
 */
export interface ClienteTaskDto extends Omit<TaskDto, "estimate" | "tags"> {
    estimate: ClienteTaskEstimateDto | null
}

/**
 * Detalhe da tarefa na visão do cliente: descrição, especificação técnica e comentários (com o autor
 * resolvido). **Sem** histórico, horas apontadas, horas reais, fator, custo/hora ou modelo.
 */
export interface ClienteTaskDetailDto extends Omit<ClienteTaskDto, "issue"> {
    description: string | null
    technicalSpec: string | null
    comments: TaskComment[]
}

/** Lista de tarefas do portal (visão do cliente). */
export interface ClienteTaskListDto {
    tasks: ClienteTaskDto[]
    fetchedAt: string
}

/** Opções do portal: repositórios permitidos ao cliente e o quadro (colunas). */
export interface ClientePortalOptionsDto {
    clientName: string
    projects: ClienteRepoDto[]
    board: TaskBoardDto
}
