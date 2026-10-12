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
export interface ClienteTaskDto extends Omit<TaskDto, "estimate" | "tags" | "agenticFlow"> {
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

/** Vínculo de um usuário com um cliente (a flag `admin` é por vínculo). */
export interface ClientMembershipDto {
    clientId: string
    clientName: string | null
    admin: boolean
}

/** Usuário de cliente como a gestão (dono ou admin do cliente) o exibe. */
export interface ClienteUserDto {
    id: string
    username: string
    email: string | null
    /** `true` quando é admin no cliente em escopo (a lista é sempre de um cliente). */
    admin: boolean
    /** Usuário padrão do cliente: usa o token do cliente e não pode ser excluído. */
    isDefault: boolean
    /** URL de login do usuário (`/cliente?t=…`), para o botão Copiar URL. */
    portalPath: string
    active: boolean
    /** Todos os vínculos do usuário (para exibir que ele é compartilhado com outros clientes). */
    memberships: ClientMembershipDto[]
    createdAt: string | null
}

/** Resposta da criação de usuário: o token próprio aparece uma única vez (o padrão não tem). */
export interface CreatedClienteUserDto {
    token: string | null
    item: ClienteUserDto
}

/** Cliente selecionável pelo usuário no portal (tela de escolha). */
export interface ClienteSelectableDto {
    id: string
    name: string
    admin: boolean
}

/** Sessão do portal: usuário logado + cliente selecionado + papel no cliente. */
export interface ClienteSessionDto {
    clientId: string
    clientName: string
    isAdmin: boolean
    user: { id: string; username: string; email: string | null }
    /** Clientes do usuário (seletor de troca no portal). */
    clients: ClienteSelectableDto[]
}

/** Tarefa concluída na visão de **custo** do cliente (sem horas reais). */
export interface ClienteCostTaskDto {
    id: string
    code: string
    title: string
    repo: string | null
    projectId: string | null
    clientHours: number
    costBrl: number
    completedAt: string
}

/** Grupo de custo do cliente por repositório. */
export interface ClienteCostGroupDto {
    projectId: string | null
    repo: string
    taskCount: number
    totalClientHours: number
    totalCostBrl: number
    tasks: ClienteCostTaskDto[]
}

/** Custo por repositório e período (financeiro do cliente). `/api/cliente/financeiro`. */
export interface ClienteFinanceDto {
    from: string | null
    to: string | null
    groups: ClienteCostGroupDto[]
    totals: { taskCount: number; totalClientHours: number; totalCostBrl: number }
}

/** KPIs de tarefas do cliente para o dashboard do portal. */
export interface ClienteDashboardDto {
    range: { from: string; to: string }
    tasksCreated: number
    tasksActive: number
    tasksCompleted: number
    byColumn: Array<{ key: string; label: string; count: number }>
    byPriority: Array<{ priority: string; count: number }>
    byType: Array<{ type: string | null; count: number }>
    /** Só é preenchido para o **admin** do cliente; `null` para os demais. */
    cost: { totalCostBrl: number; totalClientHours: number; completedTasks: number } | null
}
