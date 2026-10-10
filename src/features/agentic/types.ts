import type { OpencodeFormDto, OpencodePermissionDto } from "@/lib/ai/opencode-events"
import type { RunState, WorkbenchStage } from "./constants"
import type { AgenticSettings, CentralConfig } from "./schemas"

export type { OpencodeFormDto, OpencodeFormFieldDto, OpencodePermissionDto } from "@/lib/ai/opencode-events"

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
    /** Posição 1-based na fila global do build quando a mesa aguarda a vez (`null` caso contrário). */
    buildQueuePosition: number | null
    plans: PlanVersionDto[]
    pr: WorkbenchPrDto | null
    pendingPermissions: OpencodePermissionDto[]
    pendingForms: OpencodeFormDto[]
    usage: WorkbenchUsageDto
    /** Etapa em que a execução falhou/parou (o "Tentar novamente" refaz o turno dela). */
    lastStage: WorkbenchStage | null
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
    /** Permissões do agente pendentes (o agente está parado esperando o usuário permitir uma ação). */
    pendingPermissions: number
    /** Perguntas do agente pendentes (o agente está parado esperando o usuário responder). */
    pendingForms: number
    updatedAt: string
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
export type WorkbenchEventPayload =
    | { type: "turn"; stage: WorkbenchStage; title: string; agent: string | null; model: string | null }
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

export type WorkbenchEvent = WorkbenchEventPayload & { seq?: number; ts: string }

export type WorkbenchStreamLine = WorkbenchEvent | { type: "reset" } | { type: "ping"; ts: string }
