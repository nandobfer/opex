import { AgenticWorkbench } from "@/lib/db/models/Agentic"
import { getLocalUser } from "@/lib/local-user"
import { logger } from "@/lib/logger"
import { beginWorkPeriod, endWorkPeriod, endWorkPeriodById, listActiveWorkPeriods, touchWorkPeriod } from "@/features/time/server/service"
import { STAGE_ROLE, WORKBENCH_STAGE_LABELS, type WorkbenchStage } from "../constants"
import { loadCentral } from "./centrals"
import { isWorkbenchActive } from "./hub"
import { centralLogger } from "./log"
import { workbenchTurnAgent } from "./models"
import { loadAgenticSettings } from "./settings"

/**
 * Controle de horas agêntico: mantém o apontamento (período de trabalho) de uma mesa em sincronia
 * com o estado dela. O agente trabalhando (`running` e sem permissão/pergunta pendente) mantém um
 * período aberto; qualquer ociosidade (espera do usuário, falha, interrupção) fecha o período; a
 * conclusão fecha em definitivo. É idempotente e tolerante a falhas: nunca derruba o fluxo da mesa.
 */

const actorId = () => getLocalUser().id
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

const isStage = (value: string): value is WorkbenchStage => value in WORKBENCH_STAGE_LABELS

const descriptionFor = (stage: string | null): string => (stage && isStage(stage) ? `Desenvolvimento agêntico · ${WORKBENCH_STAGE_LABELS[stage]}` : "Desenvolvimento agêntico")

/** Reconcilia o período da mesa com o estado atual (abre, atualiza ou fecha). */
export async function syncWorkbenchTimer(workbenchId: string): Promise<void> {
    let centralId: string | null = null
    let taskCode = workbenchId
    try {
        const doc = await AgenticWorkbench.findById(workbenchId).lean()
        if (!doc) {
            await endWorkPeriod(workbenchId, actorId())
            return
        }
        centralId = doc.centralId
        taskCode = doc.taskCode
        const running = doc.runState === "running" && isWorkbenchActive(workbenchId)
        const waiting = (doc.pendingPermissions?.length ?? 0) > 0 || (doc.pendingForms?.length ?? 0) > 0
        if (!running || waiting) {
            await endWorkPeriod(workbenchId, actorId(), { description: doc.stage === "done" ? "Desenvolvimento agêntico · Concluída" : undefined })
            return
        }
        const role = STAGE_ROLE[doc.stage as WorkbenchStage] ?? "planning"
        const { settings } = await loadAgenticSettings()
        const { config } = await loadCentral(doc.centralId)
        const agent = workbenchTurnAgent(settings, config, doc, role)
        await beginWorkPeriod({ taskId: doc.taskId, workbenchId, stage: doc.stage, agent: agent.agent, model: agent.model, description: descriptionFor(doc.stage) }, actorId())
        await touchWorkPeriod(workbenchId, { stage: doc.stage, agent: agent.agent, model: agent.model, description: descriptionFor(doc.stage) })
    } catch (error) {
        if (centralId) centralLogger(centralId, taskCode).warn("Falha ao sincronizar o timer da mesa", { workbenchId, error: errorText(error) })
        else logger.warn({ err: error, workbenchId }, "[agentic] Falha ao sincronizar o timer da mesa")
    }
}

/**
 * Fecha períodos ativos órfãos: apontamentos legados sem mesa e mesas que não estão mais executando
 * neste processo (ex.: o app reiniciou no meio da execução). Roda na rotina de acompanhamento.
 */
export async function closeOrphanWorkPeriods(): Promise<number> {
    const refs = await listActiveWorkPeriods()
    let closed = 0
    for (const ref of refs) {
        if (!ref.workbenchId) {
            await endWorkPeriodById(ref.id, actorId(), "Encerrado (timer antigo, sem mesa)")
            closed++
            continue
        }
        const doc = await AgenticWorkbench.findById(ref.workbenchId).select({ runState: 1 }).lean().catch(() => null)
        if (!doc || doc.runState !== "running" || !isWorkbenchActive(ref.workbenchId)) {
            await endWorkPeriodById(ref.id, actorId(), "Encerrado (execução perdida)")
            closed++
        }
    }
    return closed
}
