import type { OpencodeFormDto, OpencodePermissionDto, WorkbenchStreamLine } from "@/features/agentic/types"
import type { ReconnectInfoDto } from "@/features/agentic/reconnect"

/** Tipos do refinamento de tarefa (cliente e servidor). */

/** Linha do stream NDJSON do refinamento — o mesmo formato das sessões longas da mesa. */
export type RefinementStreamLine = WorkbenchStreamLine

export interface RefinementAvailability {
    available: boolean
    reason: string | null
    /** Central de desenvolvimento do projeto da tarefa (diretório da sessão). */
    centralId: string | null
    sessionDirectory: string | null
}

export interface TaskRefinementUsage {
    costUsd: number
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
}

export interface TaskRefinementDto {
    id: string
    taskId: string
    taskCode: string
    taskTitle: string
    projectId: string
    centralId: string
    sessionId: string | null
    sessionDirectory: string | null
    runState: "idle" | "running" | "failed" | "interrupted"
    /** O agente julgou a especificação totalmente esclarecida. */
    resolved: boolean
    /** Turno de consolidação da especificação em andamento. */
    finalizing: boolean
    error: string | null
    /** Última especificação técnica gravada na tarefa. */
    spec: string | null
    pendingForms: OpencodeFormDto[]
    pendingPermissions: OpencodePermissionDto[]
    usage: TaskRefinementUsage
    /** Instante em que o último turno começou (episódio do ciclo de reconexão automática). */
    turnStartedAt: string | null
    /** A interrupção atual foi pedida pelo usuário (Parar): sem reconexão automática. */
    stoppedByUser: boolean
    /** Desfecho da última tentativa de reconexão (estado estável do ciclo automático). */
    reconnect: ReconnectInfoDto | null
    startedAt: string
    updatedAt: string
}

/** Estado do refinamento de uma tarefa (página da tarefa). */
export interface TaskRefinementStateDto {
    refinement: TaskRefinementDto | null
    availability: RefinementAvailability
}
