import type { AiFeatureAvailability } from "@/features/ai/types"
import type { MentorLevel, MentorReorgAction, MentorReorgItemStatus, MentorReorgStatus, MentorRunStatus, MentorSkipKind, MentorSource, MentorTarget, MentorUserTrigger } from "./constants"
import type { MentorSettings } from "./schemas"
import type { AgentCentralOption } from "../types"

/** DTOs do Agente Mentor (módulo puro). */

export interface MentorSettingsDto {
    settings: MentorSettings
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
}

/** Proposta do redator: a ação, a lista de destino (com a central, em `developer-central`) e o texto. */
export type MentorProposal = { action: "create" | "update"; memoryId: string | null; text: string; target: MentorTarget; centralId: string | null }

/** Memória da lista de destino citada pelo `skip` de cobertura. */
export interface MentorCoveredBy {
    memoryId: string
    target: MentorTarget
}

export interface MentorRunDto {
    id: string
    workbenchId: string
    centralId: string
    taskId: string
    taskCode: string
    taskTitle: string
    sources: MentorSource[]
    trigger: MentorUserTrigger | null
    userMessage: string | null
    lessonCount: number
    status: MentorRunStatus
    level: MentorLevel
    score: number | null
    threshold: number
    deciderReason: string | null
    /** Lista escolhida pelo Triador (ou a única ligada); `null` antes dele. */
    target: MentorTarget | null
    routerConfidence: number | null
    routerReason: string | null
    routerProbabilities: Record<string, number> | null
    writerAction: "create" | "update" | "skip" | null
    writerReason: string | null
    /** Motivo do `skip` (OPE-132): cobertura na lista de destino ou ausência de lição. */
    writerSkipKind: MentorSkipKind | null
    /** Memória da lista de destino citada como cobertura (só em `covered`). */
    writerCoveredBy: MentorCoveredBy | null
    /** Pedido de `skip` recusado (cobertura em outra lista); fica no detalhe da execução. */
    skipRejection: string | null
    /** Parte separada recusada pelo sanitizador (a memória principal segue). */
    splitRejection: string | null
    sanitizerReason: string | null
    proposal: MentorProposal | null
    /** Parte separada da lição (global + central), gravada na outra lista do desenvolvedor. */
    extraProposal: MentorProposal | null
    memoryId: string | null
    extraMemoryId: string | null
    error: string | null
    costUsd: number
    durationMs: number | null
    createdAt: string
    finishedAt: string | null
}

/** Resumo da memória gravada por uma execução (`GET /api/adversarial/mentor/runs/[id]/memory`), lido do Engramind. */
export interface MentorRunMemoryDto {
    /** `none`: a execução não gravou memória; `missing`: a memória não está mais no Engramind. */
    state: "none" | "ok" | "missing"
    resumo: string | null
    /** O Engramind ainda gera o resumo (o texto é provisório). */
    resumoPendente: boolean
    atualizadaEm: string | null
}

/** Página da lista `GET /api/adversarial/mentor/runs` (página do Agente Mentor e aba Execuções). */
export interface MentorRunListDto {
    items: MentorRunDto[]
    page: number
    limit: number
    total: number
    totalPages: number
    centrals: AgentCentralOption[]
}

// ── Reorganização do acervo (OPE-132) ──────────────────────────────────────

/** Item do Plano de reorganização: a memória de origem, a ação proposta e a decisão do dono. */
export interface MentorReorgItemDto {
    id: string
    origin: { target: MentorTarget; centralId: string | null; memoryId: string; resumo: string; texto: string; versao: number; owner: boolean }
    action: MentorReorgAction
    target: MentorTarget
    centralId: string | null
    /** Nome da lista de destino (com o projeto, na central). */
    targetLabel: string
    /** Texto proposto (reescrever/mover com ajuste/fusão); `null` quando a memória fica como está. */
    text: string | null
    mergeInto: string | null
    mergeIntoResumo: string | null
    reason: string
    note: string | null
    routerConfidence: number | null
    routerReason: string | null
    sanitizerReason: string | null
    moveBlocked: boolean
    ownerMemory: boolean
    status: MentorReorgItemStatus
    error: string | null
}

/** Uma reorganização: o recorte, o progresso/custo, os itens e os totais por ação. */
export interface MentorReorgDto {
    id: string
    status: MentorReorgStatus
    targets: MentorTarget[]
    centralIds: string[]
    total: number
    done: number
    costUsd: number
    durationMs: number | null
    error: string | null
    items: MentorReorgItemDto[]
    counts: Record<MentorReorgAction, number> & { pending: number; applied: number; failed: number; discarded: number }
    createdAt: string
    finishedAt: string | null
}

/** Histórico de reorganizações e as centrais existentes (opções do recorte). */
export interface MentorReorgListDto {
    items: MentorReorgSummaryDto[]
    centrals: AgentCentralOption[]
}

/** Linha do histórico (sem os itens). */
export interface MentorReorgSummaryDto {
    id: string
    status: MentorReorgStatus
    total: number
    done: number
    costUsd: number
    durationMs: number | null
    createdAt: string
    finishedAt: string | null
}

/** Estimativa antes de iniciar: quantas memórias, quantas chamadas e o custo médio por memória. */
export interface MentorReorgPreviewDto {
    memories: number
    calls: number
    averageCostUsdPerMemory: number | null
}
