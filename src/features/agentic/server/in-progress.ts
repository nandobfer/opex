import { dbConnect } from "@/lib/db"
import { AgenticWorkbench } from "@/lib/db/models/Agentic"
import type { InProgressWorkbenchDto } from "../types"
import { workbenchWaitingReason } from "../logic"
import { asRunState, asStage } from "./dto"
import { isWorkbenchActive } from "./hub"
import { slotQueuePositions } from "./slots"

/**
 * Mesas de trabalho em andamento (etapa diferente de concluída) para a lista "Trabalhos em
 * andamento": cada mesa executando (agente com período ativo) ou parada, com o motivo da espera
 * (revisão do plano, aprovação da prévia, PR, permissão/pergunta pendente, falha, interrupção ou vaga
 * na central — inclusive a reabertura de uma mesa concluída aguardando vaga).
 * Somente leitura — não escreve nem reconcilia (a limpeza de órfãos segue nas rotinas).
 */
export async function listWorkbenchesInProgress(): Promise<InProgressWorkbenchDto[]> {
    await dbConnect()
    const [docs, slots] = await Promise.all([
        AgenticWorkbench.find({ $or: [{ stage: { $ne: "done" } }, { pendingTurn: { $ne: null } }] })
            .select({ centralId: 1, taskId: 1, taskCode: 1, taskTitle: 1, stage: 1, runState: 1, pendingPermissions: 1, pendingForms: 1, pendingTurn: 1, updatedAt: 1 })
            .sort({ updatedAt: -1 })
            .lean(),
        slotQueuePositions(),
    ])
    const items = docs.map((doc) => {
        const stage = asStage(doc.stage)
        // "running" sem turno vivo neste processo (o app reiniciou) é interrupção, não execução.
        const runState = doc.runState === "running" && !isWorkbenchActive(String(doc._id)) ? "interrupted" : asRunState(doc.runState)
        const waitingFor = workbenchWaitingReason({
            stage,
            runState,
            pendingPermissions: doc.pendingPermissions?.length ?? 0,
            pendingForms: doc.pendingForms?.length ?? 0,
            waitingSlot: Boolean(doc.pendingTurn),
            slotQueuePosition: slots.get(String(doc._id)) ?? null,
        })
        return {
            workbenchId: String(doc._id),
            centralId: doc.centralId,
            taskId: doc.taskId,
            taskCode: doc.taskCode,
            taskTitle: doc.taskTitle,
            stage,
            runState,
            running: waitingFor === null,
            waitingFor,
        } satisfies InProgressWorkbenchDto
    })
    // Executando primeiro; entre os demais, o que mudou mais recentemente.
    return items.sort((a, b) => Number(b.running) - Number(a.running))
}
