import type { AiFeatureAvailability } from "@/features/ai/types"
import type { ArchitectDiagramState, ArchitectOrigin, ArchitectPhase } from "./constants"
import type { ArchitectGraph } from "./graph"
import type { AppliedOp } from "./stream-parser"
import type { ArchitectSettings } from "./schemas"

export interface ArchitectSettingsDto {
    settings: ArchitectSettings
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
}

/** Uma versão do diagrama de uma mesa (aba "Arquitetura" e Histórico). */
export interface ArchitectDiagramDto {
    id: string
    workbenchId: string
    centralId: string
    taskId: string
    taskCode: string
    taskTitle: string
    /** Versão sequencial do diagrama na mesa. */
    version: number
    /** Versão do plano de origem e a ordem do diagrama dentro dela ("Plano v2 · arquitetura v1"). */
    planVersion: number
    planSeq: number
    depth: number
    origin: ArchitectOrigin
    feedback: string | null
    state: ArchitectDiagramState
    phase: ArchitectPhase | null
    tools: number
    graph: ArchitectGraph | null
    /** Rascunho ao vivo gravado (só gerando, falhou ou interrompida; o ao vivo chega pelo stream). */
    draft: ArchitectGraph | null
    trimmed: { nodes: number; edges: number }
    warnings: string[]
    repaired: boolean
    error: string | null
    costUsd: number
    durationMs: number | null
    createdAt: string
    finishedAt: string | null
}

/** Estado do arquiteto numa mesa (DTO da mesa). */
export interface WorkbenchArchitectDto {
    /** Agente ativo e a central no escopo: a aba oferece "Gerar arquitetura". */
    applies: boolean
    approvedPlanVersion: number | null
}

/** Progresso da geração ao vivo (stream NDJSON). */
export interface ArchitectLiveProgress {
    phase: ArchitectPhase | null
    tools: number
    nodes: number
    edges: number
}

/** Linhas do stream `GET /api/architect/diagrams/[id]/stream` (NDJSON). */
export type ArchitectStreamLine =
    | { type: "snapshot"; seq: number; live: boolean; graph: ArchitectGraph; progress: ArchitectLiveProgress }
    | { type: "ops"; seq: number; ops: AppliedOp[] }
    | { type: "progress"; progress: ArchitectLiveProgress }
    | { type: "end"; state: ArchitectDiagramState }
    | { type: "ping" }
