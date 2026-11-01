import { isValidObjectId, Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { AgenticWorkbench } from "@/lib/db/models/Agentic"
import { getOpencodeClient } from "@/lib/ai/opencode-client"
import { runAfterResponse } from "@/lib/after-response"
import { getLocalUser } from "@/lib/local-user"
import { loggerFor } from "@/lib/logger"
import { ARCHITECT_AUDIT_ENTITY, ARCHITECT_HISTORY_LIMIT, type ArchitectOrigin, type ArchitectPhase } from "../constants"
import { approvedPlanVersionOf } from "../plan-version"
import type { ArchitectGenerateInput } from "../schemas"
import type { ArchitectDiagramDto, WorkbenchArchitectDto } from "../types"
import { retryPendingDeletions, runDiagram } from "./generate"
import { ArchitectDiagram, architectDb, type IArchitectDiagram } from "./models"
import { publishDiagrams } from "./publish"
import { abortWorkbenchDiagrams, isDiagramLive, liveDiagramIds, registerDiagram, releaseDiagram, withWorkbenchLock } from "./registry"
import { closeLive, openLive } from "./live-hub"
import { emptyDraft } from "../stream-parser"
import { architectAvailability, loadArchitectSettings, settingsApply } from "./settings"

/**
 * Versões do diagrama de arquitetura das mesas (SOMENTE servidor): pedido (automático na aprovação do
 * plano, manual pelo botão ou ajuste), nova tentativa, leitura, histórico e limpeza na exclusão da
 * mesa. Nada aqui altera o estado da mesa.
 */

const log = loggerFor({ module: "architect-agent" })
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
const ORPHAN_ERROR = "A geração foi perdida neste app (o app reiniciou durante a geração). Tente novamente."

export function toDiagramDto(doc: IArchitectDiagram, options: { graph?: boolean } = {}): ArchitectDiagramDto {
    return {
        id: String(doc._id),
        workbenchId: doc.workbenchId,
        centralId: doc.centralId,
        taskId: doc.taskId,
        taskCode: doc.taskCode,
        taskTitle: doc.taskTitle,
        version: doc.version,
        planVersion: doc.planVersion,
        planSeq: doc.planSeq,
        depth: doc.depth,
        origin: doc.origin,
        feedback: doc.feedback ?? null,
        state: doc.state,
        phase: (doc.progress?.phase as ArchitectPhase | null) ?? null,
        tools: doc.progress?.tools ?? 0,
        graph: options.graph === false ? null : (doc.graph ?? null),
        draft: options.graph === false || doc.state === "done" || doc.state === "superseded" ? null : (doc.draft ?? null),
        trimmed: { nodes: doc.trimmed?.nodes ?? 0, edges: doc.trimmed?.edges ?? 0 },
        warnings: doc.warnings ?? [],
        repaired: Boolean(doc.repaired),
        error: doc.error ?? null,
        costUsd: doc.usage?.costUsd ?? 0,
        durationMs: doc.finishedAt ? new Date(doc.finishedAt).getTime() - new Date(doc.startedAt).getTime() : null,
        createdAt: new Date(doc.createdAt).toISOString(),
        finishedAt: doc.finishedAt ? new Date(doc.finishedAt).toISOString() : null,
    }
}

function assertId(id: string, message: string, code: string): void {
    if (!isValidObjectId(id)) throw new DomainError(404, message, code)
}

/** Versões "gerando" sem geração viva neste processo (o app reiniciou): viram interrompidas. */
async function reconcileOrphans(filter: Record<string, unknown>): Promise<void> {
    const orphans = await ArchitectDiagram.find({ ...filter, state: "running", _id: { $nin: liveDiagramIds().filter(isValidObjectId) } }, { _id: 1, workbenchId: 1 }).lean()
    if (!orphans.length) return
    await ArchitectDiagram.updateMany({ _id: { $in: orphans.map((doc) => doc._id) }, state: "running" }, { $set: { state: "interrupted", error: ORPHAN_ERROR, "progress.phase": null, finishedAt: new Date() } })
    for (const doc of orphans) await publishDiagrams(doc.workbenchId, String(doc._id))
}

/** Versões da mesa, da mais antiga à mais recente (as descartadas ficam de fora da aba). */
export async function listWorkbenchDiagrams(workbenchId: string): Promise<ArchitectDiagramDto[]> {
    assertId(workbenchId, "Mesa de trabalho não encontrada", "WORKBENCH_NOT_FOUND")
    await architectDb()
    await reconcileOrphans({ workbenchId })
    const docs = await ArchitectDiagram.find({ workbenchId, state: { $ne: "superseded" } }).sort({ createdAt: 1 }).lean()
    return docs.map((doc) => toDiagramDto(doc))
}

export async function getDiagram(id: string): Promise<ArchitectDiagramDto> {
    assertId(id, "Versão do diagrama não encontrada", "ARCHITECT_DIAGRAM_NOT_FOUND")
    await architectDb()
    const doc = await ArchitectDiagram.findById(id).lean()
    if (!doc) throw new DomainError(404, "Versão do diagrama não encontrada", "ARCHITECT_DIAGRAM_NOT_FOUND")
    return toDiagramDto(doc)
}

/** Histórico da configuração: as versões mais recentes de todas as mesas (sem o grafo). */
export async function listArchitectHistory(limit = ARCHITECT_HISTORY_LIMIT): Promise<ArchitectDiagramDto[]> {
    await architectDb()
    await reconcileOrphans({})
    const docs = await ArchitectDiagram.find({}).sort({ createdAt: -1 }).limit(limit).lean()
    return docs.map((doc) => toDiagramDto(doc, { graph: false }))
}

async function loadWorkbench(id: string) {
    assertId(id, "Mesa de trabalho não encontrada", "WORKBENCH_NOT_FOUND")
    await architectDb()
    const doc = await AgenticWorkbench.findById(id).lean()
    if (!doc || doc.deletionRequestedAt) throw new DomainError(404, "Mesa de trabalho não encontrada", "WORKBENCH_NOT_FOUND")
    return doc
}

/** O arquiteto está ativo para a central e com o modelo disponível? (pedido manual e nova tentativa) */
async function assertReady(centralId: string): Promise<void> {
    const { settings } = await loadArchitectSettings()
    if (!settingsApply(settings, centralId)) throw new DomainError(409, 'O "Agente Arquiteto" está desativado para esta central. Ative-o em Integrações › Inteligência Artificial.', "ARCHITECT_DISABLED")
    const availability = await architectAvailability(settings)
    if (!availability.available) throw new DomainError(409, availability.reason ?? 'O "Agente Arquiteto" está indisponível', "ARCHITECT_UNAVAILABLE")
}

/**
 * Registra a geração (e abre o diagrama vivo) ANTES de a versão ser gravada como "gerando": quem
 * listar ou abrir o stream logo depois do evento já a encontra viva — nunca como órfã ("o app
 * reiniciou") nem com um stream que fecha sem dados. Se a gravação falhar, `abandon` desfaz.
 */
function begin(diagramId: string, workbenchId: string): AbortController {
    const controller = registerDiagram(diagramId, workbenchId)
    openLive(diagramId, emptyDraft())
    return controller
}

function abandon(diagramId: string, controller: AbortController): void {
    releaseDiagram(diagramId, controller)
    closeLive(diagramId, "failed")
}

function launch(diagramId: string, controller: AbortController): void {
    runAfterResponse("architect-diagram", () => runDiagram(diagramId, controller))
}

/**
 * Cria uma versão e dispara a geração em segundo plano. `auto` (aprovação do plano) substitui a
 * geração em curso de um plano anterior; pedido manual ou ajuste com geração em curso é recusado.
 */
export async function requestDiagram(workbenchId: string, input: ArchitectGenerateInput, origin: ArchitectOrigin): Promise<ArchitectDiagramDto> {
    return withWorkbenchLock(workbenchId, () => createDiagram(workbenchId, input, origin))
}

async function createDiagram(workbenchId: string, input: ArchitectGenerateInput, origin: ArchitectOrigin): Promise<ArchitectDiagramDto> {
    const workbench = await loadWorkbench(workbenchId)
    if (origin !== "auto") await assertReady(workbench.centralId)
    const planVersion = approvedPlanVersionOf(workbench)
    if (!planVersion) throw new DomainError(409, "A mesa ainda não tem plano aprovado: aprove o plano (Implementar) antes de gerar a arquitetura.", "ARCHITECT_NO_PLAN")
    await reconcileOrphans({ workbenchId })
    const running = await ArchitectDiagram.find({ workbenchId, state: "running" }, { _id: 1, planVersion: 1 }).lean()
    if (running.length) {
        if (origin !== "auto" || running.every((doc) => doc.planVersion >= planVersion)) throw new DomainError(409, "O Agente Arquiteto já está gerando um diagrama nesta mesa; aguarde terminar.", "ARCHITECT_BUSY")
        abortWorkbenchDiagrams(workbenchId, "superseded")
    }
    let baseDiagramId: string | null = null
    if (input.feedback) {
        const base = input.baseDiagramId
            ? await ArchitectDiagram.findOne({ _id: input.baseDiagramId, workbenchId }).lean()
            : await ArchitectDiagram.findOne({ workbenchId, state: "done" }).sort({ createdAt: -1 }).lean()
        if (!base?.graph) throw new DomainError(409, "Não há um diagrama pronto para ajustar: gere a arquitetura primeiro.", "ARCHITECT_NO_BASE")
        baseDiagramId = String(base._id)
    }
    const { settings } = await loadArchitectSettings()
    const depth = input.depth ?? settings.diagram.depth
    const [last, samePlan] = await Promise.all([
        ArchitectDiagram.findOne({ workbenchId }, { version: 1 }).sort({ version: -1 }).lean(),
        ArchitectDiagram.countDocuments({ workbenchId, planVersion, state: { $ne: "superseded" } }),
    ])
    const id = new Types.ObjectId().toHexString()
    const controller = begin(id, workbenchId)
    let created
    try {
        created = await ArchitectDiagram.create({
            _id: id,
            workbenchId,
            centralId: workbench.centralId,
            taskId: workbench.taskId,
            taskCode: workbench.taskCode,
            taskTitle: workbench.taskTitle,
            version: (last?.version ?? 0) + 1,
            planVersion,
            planSeq: samePlan + 1,
            depth,
            origin: input.feedback ? "adjust" : origin,
            feedback: input.feedback ?? null,
            baseDiagramId,
            state: "running",
            progress: { phase: "starting", tools: 0, lastTool: null },
            startedAt: new Date(),
        })
    } catch (error) {
        abandon(id, controller)
        throw error
    }
    try {
        await recordAudit({
            userId: getLocalUser().id,
            entidade: ARCHITECT_AUDIT_ENTITY,
            entidadeId: id,
            acao: AcaoAuditoria.CRIAR,
            depois: { tarefa: workbench.taskCode, versao: created.version, plano: planVersion, profundidade: depth, origem: created.origin },
        })
        await publishDiagrams(workbenchId, id)
    } catch (error) {
        // Sem a geração, a versão gravada vira órfã e a próxima listagem a marca como interrompida.
        abandon(id, controller)
        throw error
    }
    launch(id, controller)
    return toDiagramDto(created.toObject())
}

/** "Tentar novamente": refaz a MESMA versão que falhou ou foi interrompida. */
export async function retryDiagram(id: string): Promise<ArchitectDiagramDto> {
    assertId(id, "Versão do diagrama não encontrada", "ARCHITECT_DIAGRAM_NOT_FOUND")
    await architectDb()
    const doc = await ArchitectDiagram.findById(id).lean()
    if (!doc) throw new DomainError(404, "Versão do diagrama não encontrada", "ARCHITECT_DIAGRAM_NOT_FOUND")
    await loadWorkbench(doc.workbenchId)
    return withWorkbenchLock(doc.workbenchId, () => restartDiagram(id, doc))
}

async function restartDiagram(id: string, doc: IArchitectDiagram & { _id: unknown }): Promise<ArchitectDiagramDto> {
    if (doc.state !== "failed" && doc.state !== "interrupted") throw new DomainError(409, "Só uma versão que falhou pode ser gerada de novo", "ARCHITECT_NOT_FAILED")
    // A execução anterior desta versão ainda está encerrando (limpeza da sessão): espera ela sair do registro.
    if (isDiagramLive(id)) throw new DomainError(409, "A geração anterior desta versão ainda está encerrando; tente novamente em alguns segundos.", "ARCHITECT_BUSY")
    await assertReady(doc.centralId)
    await reconcileOrphans({ workbenchId: doc.workbenchId })
    if (await ArchitectDiagram.exists({ workbenchId: doc.workbenchId, state: "running" })) throw new DomainError(409, "O Agente Arquiteto já está gerando um diagrama nesta mesa; aguarde terminar.", "ARCHITECT_BUSY")
    const controller = begin(id, doc.workbenchId)
    // Transição atômica: só uma versão que AINDA está falhou/interrompida volta a gerar.
    const updated = await ArchitectDiagram.updateOne(
        { _id: doc._id, state: { $in: ["failed", "interrupted"] } },
        { $set: { state: "running", error: null, graph: null, draft: null, warnings: [], trimmed: { nodes: 0, edges: 0 }, repaired: false, progress: { phase: "starting", tools: 0, lastTool: null }, startedAt: new Date(), finishedAt: null } },
    ).catch((error: unknown) => {
        abandon(id, controller)
        throw error
    })
    if (updated.modifiedCount !== 1) {
        abandon(id, controller)
        throw new DomainError(409, "Esta versão já está sendo gerada de novo.", "ARCHITECT_BUSY")
    }
    try {
        await recordAudit({ userId: getLocalUser().id, entidade: ARCHITECT_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: { estado: doc.state }, depois: { estado: "running", acao: "tentar-novamente" } })
        await publishDiagrams(doc.workbenchId, id)
    } catch (error) {
        abandon(id, controller)
        throw error
    }
    launch(id, controller)
    return getDiagram(id)
}

/**
 * Aprovação do plano (botão Implementar), depois da resposta: gera a arquitetura do plano aprovado
 * quando o arquiteto se aplica e o disparo é automático. Nunca lança; cada pulo fica no log.
 */
export async function onPlanApproved(workbenchId: string): Promise<void> {
    try {
        const { settings } = await loadArchitectSettings()
        const workbench = await loadWorkbench(workbenchId)
        if (!settingsApply(settings, workbench.centralId)) return void log.info({ workbenchId }, "[architect] desativado para a central: sem diagrama na aprovação")
        if (settings.trigger !== "auto") return void log.info({ workbenchId }, "[architect] disparo manual: sem diagrama automático na aprovação")
        const availability = await architectAvailability(settings)
        if (!availability.available) return void log.info({ workbenchId, reason: availability.reason }, "[architect] indisponível: sem diagrama na aprovação")
        const planVersion = approvedPlanVersionOf(workbench)
        if (!planVersion) return void log.info({ workbenchId }, "[architect] sem plano aprovado: nada a gerar")
        if (await ArchitectDiagram.exists({ workbenchId, planVersion, state: { $in: ["running", "done"] } })) return void log.info({ workbenchId, planVersion }, "[architect] o plano já tem diagrama: aprovação repetida ignorada")
        await requestDiagram(workbenchId, {}, "auto")
    } catch (error) {
        log.warn({ err: errorText(error), workbenchId }, "[architect] não foi possível gerar a arquitetura na aprovação do plano")
    }
}

/** Exclusão da mesa: aborta as gerações e exclui as sessões pendentes (melhor esforço; as versões ficam no histórico). */
export async function cleanupWorkbenchDiagrams(workbenchId: string): Promise<void> {
    abortWorkbenchDiagrams(workbenchId, "deleted")
    try {
        await architectDb()
        if (!(await ArchitectDiagram.exists({ workbenchId, pendingSessionDeletion: { $ne: null } }))) return
        await retryPendingDeletions(await getOpencodeClient(), workbenchId)
    } catch (error) {
        log.warn({ err: errorText(error), workbenchId }, "[architect] falha ao excluir sessões do arquiteto da mesa")
    }
}

/** Estado do arquiteto para o DTO da mesa. Nunca lança. */
export async function workbenchArchitect(doc: { centralId: string; stage: string; plans: readonly unknown[]; branch: string | null; approvedPlanVersion?: number | null }): Promise<WorkbenchArchitectDto> {
    let applies = false
    try {
        applies = settingsApply((await loadArchitectSettings()).settings, doc.centralId)
    } catch (error) {
        log.warn({ err: errorText(error) }, "[architect] configuração ilegível no DTO da mesa")
    }
    return { applies, approvedPlanVersion: approvedPlanVersionOf(doc) }
}

