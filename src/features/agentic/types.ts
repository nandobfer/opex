import type { TaskAgenticFlow } from "@/features/tasks/constants"
import type { OpencodeFormDto, OpencodePermissionDto } from "@/lib/ai/opencode-events"
import type { ForkIntegrationTarget, ForkMode, ForkStatus, PendingTurnAction, RunState, WorkbenchModelRole, WorkbenchStage } from "./constants"
import type { ReconnectInfoDto } from "./reconnect"
import type { AgenticSettings, CentralConfig } from "./schemas"

export type { OpencodeFormDto, OpencodeFormFieldDto, OpencodePermissionDto } from "@/lib/ai/opencode-events"
export type { ReconnectInfoDto, ReconnectOutcome } from "./reconnect"

export interface AgenticAvailability {
    available: boolean
    reason: string | null
}

export interface AgenticSettingsDto {
    settings: AgenticSettings
    isDefault: boolean
    availability: AgenticAvailability
    updatedAt: string | null
}

export interface CentralTestResult {
    at: string
    ok: boolean
    message: string
}

export interface CentralCheck {
    label: string
    status: "ok" | "warn" | "error"
    detail: string
}

export interface CentralTestOutcome {
    ok: boolean
    message: string
    checks: CentralCheck[]
}

export interface CentralDto {
    id: string
    projectId: string
    projectName: string
    /** Sigla do projeto (repositório), ex.: `OPX`; vazia sem projeto vinculado. */
    sigla: string
    config: CentralConfig
    /** Repositório vinculado ao produto (Integrações › GitHub), ex.: `org/repo`. */
    repo: string | null
    repoUrl: string | null
    lastTest: CentralTestResult | null
    /** Mesas não concluídas / executando agora. */
    activeWorkbenches: number
    runningWorkbenches: number
    createdAt: string
    updatedAt: string
}

export interface PlanVersionDto {
    version: number
    text: string
    /** Pedido do usuário (ou do PR) que originou esta versão. */
    feedback: string | null
    createdAt: string
}

export interface WorkbenchPrDto {
    number: number
    url: string
    state: "open" | "closed" | "merged"
    mergedAt: string | null
}

export interface WorkbenchUsageDto {
    costUsd: number
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
}

export interface SlotQueueDto {
    position: number | null
    action: PendingTurnAction
}

/** Modelo efetivo de um papel na mesa ou no fork: o do papel (`overridden: false`) ou o trocado. */
export interface ModelChoiceDto {
    /** `provedor/modelo`; `null` = modelo padrão do agente. */
    model: string | null
    variant: string | null
    overridden: boolean
}

export interface WorkbenchDto {
    id: string
    centralId: string
    taskId: string
    taskCode: string
    taskTitle: string
    stage: WorkbenchStage
    runState: RunState
    error: string | null
    sessionId: string | null
    sessionDirectory: string | null
    branch: string | null
    worktreePath: string | null
    port: number | null
    previewUrl: string | null
    previewHealthy: boolean | null
    /** Fluxo escolhido na abertura da mesa: `preview` (padrão) sobe a prévia; `auto_pr` vai direto ao PR. */
    agenticFlow: TaskAgenticFlow
    /** Pedido de exclusão em andamento (a limpeza do ambiente roda antes de a mesa ser removida). */
    deletionRequestedAt: string | null
    /** Posição 1-based na fila global do build quando a mesa aguarda a vez (`null` caso contrário). */
    buildQueuePosition: number | null
    /** Espera por vaga no limite de mesas da central (posição 1-based e o que será executado); `null` sem espera. */
    slotQueue: SlotQueueDto | null
    plans: PlanVersionDto[]
    pr: WorkbenchPrDto | null
    pendingPermissions: OpencodePermissionDto[]
    pendingForms: OpencodeFormDto[]
    usage: WorkbenchUsageDto
    /** Etapa em que a execução falhou/parou (o "Tentar novamente" refaz o turno dela). */
    lastStage: WorkbenchStage | null
    /** Instante em que o último turno começou (episódio do ciclo de reconexão automática). */
    turnStartedAt: string | null
    /** A interrupção atual foi pedida pelo usuário (Parar): sem reconexão automática. */
    stoppedByUser: boolean
    /** Desfecho da última tentativa de reconexão (estado estável do ciclo automático). */
    reconnect: ReconnectInfoDto | null
    /** Conclusão manual (sem PR): motivo e etapa de origem; `null` na conclusão pelo merge ou mesa aberta. */
    manualCompletion: { reason: string; fromStage: WorkbenchStage; at: string } | null
    forksDonePrompt: { count: number; at: string } | null
    /** Modelo efetivo de cada papel da conversa principal (`null` quando a central não pôde ser lida). */
    models: Record<WorkbenchModelRole, ModelChoiceDto> | null
    /** Chat durante a execução (padrão global + ajuste da central): mensagens com o agente trabalhando. */
    liveChat: boolean
    /** O Agente Adversário se aplica a esta mesa (ativo e a central no escopo): passo "Revisão adversária" na trilha. */
    adversarial: boolean
    startedAt: string
    completedAt: string | null
    updatedAt: string
}

/** Resumo da mesa na lista de tarefas da central. */
export interface WorkbenchSummaryDto {
    id: string
    taskId: string
    taskCode: string
    taskTitle: string
    stage: WorkbenchStage
    runState: RunState
    /** Posição 1-based na fila global do build quando a mesa aguarda a vez (`null` caso contrário). */
    buildQueuePosition: number | null
    /** Espera por vaga no limite de mesas da central; `null` sem espera. */
    slotQueue: SlotQueueDto | null
    /** Permissões do agente pendentes (o agente está parado esperando o usuário permitir uma ação). */
    pendingPermissions: number
    /** Perguntas do agente pendentes (o agente está parado esperando o usuário responder). */
    pendingForms: number
    /** Mesa concluída perguntando o que fazer com os forks em aberto. */
    forksDonePrompt: boolean
    updatedAt: string
}

export interface ForkIntegrationDto {
    target: ForkIntegrationTarget
    summary: string
    appliedAt: string
}

/** Fork da conversa de uma mesa (sessão paralela somente leitura). */
export interface ForkDto {
    id: string
    workbenchId: string
    number: number
    /** Fork pai (fork de fork); `null` quando aberto da conversa principal. */
    parentForkId: string | null
    parentNumber: number | null
    status: ForkStatus
    runState: RunState
    error: string | null
    origin: "fork" | "fresh"
    /** Modo atual: `plan` (somente leitura) ou `build` (pode alterar arquivos conforme o agente). */
    mode: ForkMode
    /** Travado como somente leitura (sem volta): o modo fica `plan`. */
    readOnly: boolean
    /** Modelo efetivo do fork (papel Fork da conversa ou o trocado; `null` quando a central não pôde ser lida). */
    model: ModelChoiceDto | null
    /** Chat durante a execução (padrão global + ajuste da central). */
    liveChat: boolean
    forkedFromStage: WorkbenchStage
    /** Resumo proposto (em revisão enquanto `integrating`). */
    summary: string | null
    integration: ForkIntegrationDto | null
    pendingPermissions: OpencodePermissionDto[]
    pendingForms: OpencodeFormDto[]
    usage: WorkbenchUsageDto
    createdAt: string
    updatedAt: string
    closedAt: string | null
}

/**
 * Mesa em andamento vista pela lista "Trabalhos em andamento": executando (agente com período
 * ativo) ou parada aguardando ação humana (revisão do plano, prévia, PR, permissão/pergunta,
 * falha ou interrupção). `waitingFor` é o motivo em pt-BR quando não está executando.
 */
export interface InProgressWorkbenchDto {
    workbenchId: string
    centralId: string
    taskId: string
    taskCode: string
    taskTitle: string
    stage: WorkbenchStage
    runState: RunState
    /** Agente executando agora: destaque verde + cronômetro. */
    running: boolean
    /** Motivo (pt-BR) quando não está executando; `null` quando executando. */
    waitingFor: string | null
}

/** Tarefa aguardando na fila da central. A posição segue a ordem dos cards na coluna do kanban. */
export interface QueueItemDto {
    taskId: string
    code: string
    title: string
    columnId: string
    /** 1-based, na ordem do card na coluna da fila. */
    position: number
}

/** Linha do stream da mesa (NDJSON). `seq` existe nos eventos gravados; os transitórios não têm. */
export type PrWatchLevel = "info" | "success" | "warn" | "error"

/** Achado no veredito do Agente Adversário, como aparece na saída da mesa. */
export interface AdversarialVerdictFinding {
    id: string
    severity: "critical" | "high" | "medium" | "low" | "nit"
    title: string
    file: string | null
    line: number | null
    blocking: boolean
    demotedReason: string | null
}

/** Passo de uma verificação do acompanhamento do PR (rotina `agentic-pr-watch`). */
export interface PrWatchStep {
    ts: string
    level: PrWatchLevel
    text: string
}

/** Desfecho da verificação: `idle` = nada a fazer (só a última fica gravada); `action` = encontrou algo e agiu; `error` = falha. */
export type PrWatchOutcome = "idle" | "action" | "error"

/** Agendamento do acompanhamento do PR (contagem até a próxima verificação). */
export interface PrWatchScheduleDto {
    /** Agendador e rotina ligados em Integrações › Crons. */
    enabled: boolean
    nextCheckAt: string | null
    /** A rotina está executando agora. */
    running: boolean
}

export type WorkbenchEventPayload =
    | { type: "turn"; stage: string; title: string; agent: string | null; model: string | null }
    | { type: "user"; text: string }
    | { type: "text"; text: string }
    | { type: "reasoning" }
    | { type: "tool"; id: string; name: string; state: "running" | "done" | "error"; input?: string | null; output?: string | null; error?: string | null }
    | { type: "tool-progress"; id: string; output: string }
    | { type: "notice"; level: "info" | "warn" | "error" | "success"; message: string }
    | { type: "permission"; permission: OpencodePermissionDto }
    | { type: "permission-replied"; id: string; decision: string }
    | { type: "form"; form: OpencodeFormDto }
    | { type: "form-closed"; id: string }
    | { type: "turn-end"; outcome: "succeeded" | "failed" | "interrupted"; message: string | null; durationMs: number; costUsd: number }
    /** Passo ao vivo de uma verificação do PR (transitório). */
    | { type: "pr-watch-step"; checkId: string; prNumber: number; level: PrWatchLevel; text: string }
    /** Verificação do PR concluída (gravada). */
    | { type: "pr-watch"; checkId: string; prNumber: number; startedAt: string; steps: PrWatchStep[]; outcome: PrWatchOutcome; summary: string; nextCheckAt: string | null }
    /** Veredito de uma rodada do Agente Adversário (gravado). */
    | { type: "adversarial-verdict"; reviewId: string; round: number; level: string; summary: string; outcome: string; findings: AdversarialVerdictFinding[] }

export type WorkbenchEvent = WorkbenchEventPayload & { seq?: number; ts: string }

export type WorkbenchStreamLine = WorkbenchEvent | { type: "reset" } | { type: "ping"; ts: string }
