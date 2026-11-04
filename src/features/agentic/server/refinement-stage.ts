import { dbConnect } from "@/lib/db"
import { AgenticWorkbench } from "@/lib/db/models/Agentic"
import { isRefinementStage } from "../logic"
import { asStage } from "./dto"
import { runInCentral } from "./slots"
import { applyRefinementState } from "./workflow"

/**
 * Ponte refinamento → mesa (OPE-137): depois de cada mudança do refinamento da tarefa, a mesa em
 * "Refinando"/"Especificação pronta" passa a refletir o mesmo estado (status, perguntas pendentes e a
 * passagem para "Especificação pronta" ou para o planejamento). Roda em série com as demais decisões de
 * vaga da central; quem chama nunca aguarda (pode estar dentro de outro `runInCentral`).
 */
export async function syncWorkbenchFromRefinement(taskId: string): Promise<void> {
    await dbConnect()
    const doc = await AgenticWorkbench.findOne({ taskId }).select({ centralId: 1, stage: 1 }).lean()
    if (!doc || !isRefinementStage(asStage(doc.stage))) return
    await runInCentral(doc.centralId, () => applyRefinementState(String(doc._id)))
}
