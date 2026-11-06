import type { RoutineEntryTarget, RoutineEngine, RoutineLimits, RoutineOpencodeEngine, RoutineOpexEngine, RoutineTrigger } from "./schemas"
import type { RoutineAgentStatus, RoutineProvisioningStatus, RoutineRunStatus, RoutineTriggerOrigin } from "./status"

/** DTOs dos agentes rotineiros (OPE-130). Nunca levam o token do agente nem o segredo do MCP. */

export interface RoutineProvisioningExtraDto {
    channel: string
    name: string
    reason: string
    created: boolean
}

export interface RoutineProvisioningBlockedDto {
    channel: string
    name: string
    at: string
}

export interface RoutineProvisioningDto {
    status: RoutineProvisioningStatus
    error: string | null
    at: string | null
    channels: string[]
    extras: RoutineProvisioningExtraDto[]
    blocked: RoutineProvisioningBlockedDto[]
    warnings: string[]
    steps: { identity?: boolean; agent: boolean; token: boolean; channels: boolean; extras: boolean; workdir: boolean }
}

export interface RoutineTriggerDto {
    trigger: RoutineTrigger
    nextAt: string | null
    lastFiredAt: string | null
}

export interface RoutineAgentDto {
    id: string
    /** Vazio enquanto o provisionamento gera (use `routineAgentTitle`). */
    name: string
    /** "Agente <nome>" (ou "Agente rotineiro (gerando nome…)"). */
    title: string
    generated: { name: boolean; objective: boolean }
    slug: string
    objective: string
    instructions: string
    engine: RoutineEngine
    opex: RoutineOpexEngine
    opencode: RoutineOpencodeEngine
    confirmIrreversible: boolean
    limits: RoutineLimits
    triggers: RoutineTrigger[]
    schedule: RoutineTriggerDto[]
    status: RoutineAgentStatus
    provisioning: RoutineProvisioningDto
    /** Gatilho de webhook ligado (a URL é a da API pública). */
    webhookEnabled: boolean
    workdir: string | null
    engramindAgent: string
    channel: string
    lastRun: { id: string; status: RoutineRunStatus; at: string } | null
    nextFireAt: string | null
    activeRuns: number
    createdAt: string
    updatedAt: string
}

export interface RoutinePendingActionDto {
    id: string
    summary: string
    kind: "request" | "tool"
    toolLabel: string | null
    input: string | null
    requestedAt: string
    resolvedAt: string | null
    resolution: "confirmed" | "rejected" | null
}

export interface RoutineRunDto {
    id: string
    agentId: string
    agentName: string
    seq: number
    status: RoutineRunStatus
    origin: RoutineTriggerOrigin
    request: string | null
    hasPayload: boolean
    engine: RoutineEngine
    model: string | null
    queuedAt: string
    startedAt: string | null
    finishedAt: string | null
    /** Duração (Executando + Esperando), em ms. */
    activeMs: number
    waitingMs: number
    tokens: number
    costUsd: number | null
    /** Custo parcial: algum passo não informou custo (provedor direto). */
    costPartial: boolean
    hibernation: { at: string; reason: string } | null
    pendingAction: RoutinePendingActionDto | null
    report: string | null
    error: string | null
    warnings: string[]
    delayMs: number | null
}

export interface RoutineRunStepDto {
    id: string
    kind: "text" | "tool" | "wait" | "hibernate" | "confirmation" | "notice" | "resume"
    label: string
    detail: string | null
    toolName: string | null
    durationMs: number | null
    error: boolean
    at: string
}

export interface RoutineRunDetailDto extends RoutineRunDto {
    steps: RoutineRunStepDto[]
    tools: { name: string; count: number }[]
}

export interface RoutineEntryDto {
    id: string
    target: RoutineEntryTarget
    channel: string
    text: string
    memoryId: string | null
    createdAt: string
}

export interface RoutineAgentMetricsDto {
    kpis: { runs: number; completed: number; errors: number; avgDurationMs: number | null; tokens: number; costUsd: number | null; costPartial: boolean }
    days: { day: string; runs: number; completed: number; errors: number; tokens: number; costUsd: number | null }[]
    lastRunAt: string | null
}

export interface RoutineOpencodeOptionsDto {
    available: boolean
    reason: string | null
    mcps: { name: string; status: string; browser: boolean }[]
    browserAvailable: boolean
}

/** Payloads dos eventos Pusher. */
export interface RoutineAgentUpdatedPayload {
    id: string
}
export interface RoutineRunUpdatedPayload {
    id: string
    agentId: string
    status: RoutineRunStatus
}
export interface RoutineRunAttentionPayload {
    id: string
    agentId: string
    kind: "confirmation" | "finished"
    status: RoutineRunStatus
    /** Nome do agente (texto do toast; não é dado sensível). */
    agentName?: string
}

/** Segredo do agente rotineiro na tela (sem o valor: ele só entra). */
export interface RoutineSecretDto {
    id: string
    name: string
    description: string
    allowedHosts: string[]
    lastUsedAt: string | null
    createdAt: string
    updatedAt: string
}
