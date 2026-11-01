import type { AiFeatureAvailability } from "@/features/ai/types"
import type { ArchitectDiagramState, ArchitectOrigin, ArchitectPhase } from "./constants"
import type { ArchitectGraph } from "./graph"
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
