import { dbConnect } from "@/lib/db"
import { AgenticWorkbench } from "@/lib/db/models/Agentic"
import { loggerFor } from "@/lib/logger"
import { asModelOverride, isRefinementStage, type ModelOverride } from "@/features/agentic/logic"
import { WORKBENCH_STAGES, type WorkbenchStage } from "@/features/agentic/constants"

/**
 * Vínculo do refinamento com a mesa de trabalho da tarefa (OPE-137, SOMENTE servidor). Mesa e
 * refinamento são únicos por tarefa, então o vínculo é o `taskId`: nenhum id cruzado sobrevive a um
 * Recomeçar. A transição de etapa da mesa fica em `agentic/server/refinement-stage.ts` (import
 * dinâmico: o fluxo da mesa importa este módulo, e o refinamento não pode carregar o fluxo da mesa no topo).
 */

const log = loggerFor({ module: "refinement" })

export interface LinkedWorkbench {
    id: string
    centralId: string
    stage: WorkbenchStage
    /** Troca do "Modelo do Refinamento" feita na mesa (`null` = modelo do Agente Refinador). */
    refinementModel: ModelOverride | null
}

const asStage = (value: unknown): WorkbenchStage | null => ((WORKBENCH_STAGES as readonly unknown[]).includes(value) ? (value as WorkbenchStage) : null)

/** Mesa da tarefa (`null` sem mesa). */
export async function linkedWorkbench(taskId: string): Promise<LinkedWorkbench | null> {
    await dbConnect()
    const doc = await AgenticWorkbench.findOne({ taskId }).select({ centralId: 1, stage: 1, modelOverrides: 1 }).lean()
    const stage = doc ? asStage(doc.stage) : null
    if (!doc || !stage) return null
    const overrides = (doc.modelOverrides ?? {}) as Record<string, unknown>
    return { id: String(doc._id), centralId: doc.centralId, stage, refinementModel: asModelOverride(overrides.refinement) }
}

/** A mesa está no refinamento ("Refinando" ou "Especificação pronta"). */
export const inRefinementStage = (link: LinkedWorkbench | null): link is LinkedWorkbench => Boolean(link && isRefinementStage(link.stage))

/** A mesa já passou do refinamento (do planejamento em diante): o refinamento fica bloqueado (item 18). */
export const pastRefinement = (link: LinkedWorkbench | null): link is LinkedWorkbench => Boolean(link && !isRefinementStage(link.stage))

/**
 * Reflete o estado do refinamento na mesa (etapa e status), em segundo plano: nunca é aguardada, porque
 * pode ser disparada de dentro de uma decisão de vaga da central (`runInCentral`) e travaria a corrente.
 */
export function syncLinkedWorkbench(taskId: string): void {
    void import("@/features/agentic/server/refinement-stage")
        .then((stage) => stage.syncWorkbenchFromRefinement(taskId))
        .catch((error: unknown) => log.warn({ err: error instanceof Error ? error.message : String(error), taskId }, "[refinement] falha ao sincronizar a mesa de trabalho"))
}

/** Continuar/Recomeçar com a mesa em "Especificação pronta": passam pela mesa (vaga da central). */
export async function delegateToWorkbench(workbenchId: string, action: "continue-refinement" | "restart-refinement"): Promise<void> {
    const workflow = await import("@/features/agentic/server/workflow")
    if (action === "continue-refinement") await workflow.continueRefinementInWorkbench(workbenchId)
    else await workflow.restartRefinementInWorkbench(workbenchId)
}
