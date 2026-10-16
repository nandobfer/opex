import { isValidObjectId } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { AgenticCentral, AgenticEvent, AgenticWorkbench, type IAgenticCentral } from "@/lib/db/models/Agentic"
import { Project } from "@/lib/db/models/Project"
import { publishAppEvent } from "@/lib/pusher/channels"
import { AGENT_ROLE_LABELS, AGENT_ROLES, AGENTIC_AUDIT_CENTRAL, AGENTIC_UPDATED_EVENT } from "../constants"
import { parseCentralConfig } from "../logic"
import { defaultCentralConfig, type CentralConfig, type CreateCentralInput } from "../schemas"

import type { CentralDto } from "../types"
import { toCentralDto } from "./dto"
import { centralLogger } from "./log"
import { assertAgentConfigs } from "./settings"

export async function publishAgentic(payload: Record<string, unknown>): Promise<void> {
    await publishAppEvent(AGENTIC_UPDATED_EVENT, payload).catch(() => undefined)
}

export async function repoForProject(projectId: string): Promise<{ repo: string; repoUrl: string; sigla: string } | null> {
    const project = await Project.findById(projectId).select({ repo: 1, repoUrl: 1, sigla: 1 }).lean().catch(() => null)
    return project ? { repo: project.repo, repoUrl: project.repoUrl, sigla: project.sigla } : null
}

/** Coluna de entrada do vínculo do projeto (usada como destino ao reabrir a mesa quando a central não define "Ao abrir a mesa"). */
export async function entryColumnForProject(projectId: string): Promise<string | null> {
    const project = await Project.findById(projectId).select({ entryColumnKey: 1 }).lean().catch(() => null)
    return project?.entryColumnKey ?? null
}

async function countsByCentral(): Promise<Map<string, { active: number; running: number }>> {
    const rows = await AgenticWorkbench.aggregate<{ _id: string; active: number; running: number }>([
        { $match: { stage: { $ne: "done" } } },
        { $group: { _id: "$centralId", active: { $sum: 1 }, running: { $sum: { $cond: [{ $eq: ["$runState", "running"] }, 1, 0] } } } },
    ])
    return new Map(rows.map((row) => [row._id, { active: row.active, running: row.running }]))
}

export async function listCentrals(): Promise<CentralDto[]> {
    await dbConnect()
    const [docs, counts, projects] = await Promise.all([AgenticCentral.find().sort({ projectName: 1 }).lean(), countsByCentral(), Project.find().select({ repo: 1, repoUrl: 1, sigla: 1 }).lean()])
    const repos = new Map(projects.map((project) => [String(project._id), { repo: project.repo, repoUrl: project.repoUrl, sigla: project.sigla }]))
    return docs.map((doc) => {
        const count = counts.get(String(doc._id)) ?? { active: 0, running: 0 }
        return toCentralDto(doc, { repo: repos.get(doc.projectId) ?? null, ...count })
    })
}

/** Central + configuração validada (404 se não existir). */
export async function loadCentral(id: string): Promise<{ doc: IAgenticCentral; config: CentralConfig }> {
    if (!isValidObjectId(id)) throw new DomainError(404, "Central não encontrada", "CENTRAL_NOT_FOUND")
    await dbConnect()
    const doc = await AgenticCentral.findById(id).lean()
    if (!doc) throw new DomainError(404, "Central não encontrada", "CENTRAL_NOT_FOUND")
    return { doc, config: parseCentralConfig(doc.config) }
}

export async function getCentral(id: string): Promise<CentralDto> {
    const { doc } = await loadCentral(id)
    const counts = (await countsByCentral()).get(id) ?? { active: 0, running: 0 }
    return toCentralDto(doc, { repo: await repoForProject(doc.projectId), ...counts })
}

export async function createCentral(input: CreateCentralInput, actorId: string): Promise<CentralDto> {
    await dbConnect()
    if (await AgenticCentral.exists({ projectId: input.projectId })) throw new DomainError(409, `Já existe uma central para ${input.projectName}`, "CENTRAL_EXISTS")
    const config = defaultCentralConfig(input.sessionDirectory)
    let doc: IAgenticCentral
    try {
        doc = (await AgenticCentral.create({ projectId: input.projectId, projectName: input.projectName, config })).toObject()
    } catch (error) {
        if ((error as { code?: number }).code === 11000) throw new DomainError(409, `Já existe uma central para ${input.projectName}`, "CENTRAL_EXISTS")
        throw error
    }
    const id = String(doc._id)
    await recordAudit({ userId: actorId, entidade: AGENTIC_AUDIT_CENTRAL, entidadeId: id, acao: AcaoAuditoria.CRIAR, depois: { produto: input.projectName, diretorio: input.sessionDirectory } })
    centralLogger(id).success(`Central criada para ${input.projectName} em ${input.sessionDirectory}`)
    await publishAgentic({ centralId: id })
    return getCentral(id)
}

export async function updateCentral(id: string, config: CentralConfig, actorId: string): Promise<CentralDto> {
    const { doc, config: before } = await loadCentral(id)
    await assertAgentConfigs(
        AGENT_ROLES.map((role) => ({ label: AGENT_ROLE_LABELS[role].label, config: config.agents[role] })),
        false,
    )
    await AgenticCentral.updateOne({ _id: doc._id }, { $set: { config } })
    await recordAudit({ userId: actorId, entidade: AGENTIC_AUDIT_CENTRAL, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: before, depois: config })
    centralLogger(id).info("Configuração da central atualizada")
    await publishAgentic({ centralId: id })
    // A coluna da fila ou o limite podem ter mudado: reavalia a fila da central (import dinâmico evita ciclo).
    void import("./queue")
        .then((queue) => queue.pumpCentralQueue(id))
        .catch(() => undefined)
    return getCentral(id)
}

export async function deleteCentral(id: string, actorId: string): Promise<void> {
    const { doc } = await loadCentral(id)
    const active = await AgenticWorkbench.countDocuments({ centralId: id, stage: { $ne: "done" } })
    if (active > 0) throw new DomainError(409, `A central tem ${active} mesa(s) em andamento: conclua ou exclua as mesas antes`, "CENTRAL_IN_USE")
    // Forks das mesas concluídas (sessões e saída); import dinâmico evita o ciclo com `forks.ts`.
    await (await import("./forks")).deleteCentralForks(id)
    const finished = await AgenticWorkbench.find({ centralId: id }).select({ _id: 1 }).lean()
    await AgenticEvent.deleteMany({ workbenchId: { $in: finished.map((item) => String(item._id)) } })
    await AgenticWorkbench.deleteMany({ centralId: id })
    await AgenticCentral.deleteOne({ _id: doc._id })
    await recordAudit({ userId: actorId, entidade: AGENTIC_AUDIT_CENTRAL, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { produto: doc.projectName } })
    await publishAgentic({ centralId: id })
}

export async function saveCentralTest(id: string, result: { ok: boolean; message: string }): Promise<void> {
    await AgenticCentral.updateOne({ _id: id }, { $set: { lastTest: { at: new Date(), ...result } } })
    await publishAgentic({ centralId: id })
}

