import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DevTask } from "@/lib/db/models/DevTask"
import { Project, type IProject } from "@/lib/db/models/Project"
import { TaskBoardColumn } from "@/lib/db/models/TaskBoard"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { GITHUB_AUDIT } from "../constants"
import { htmlBaseOf, projectNameFromRepo, siglaFromRepo } from "../logic"
import type { RepoLinkValues } from "../schemas"
import type { GithubLinkDto } from "../types"
import { publishGithubUpdated } from "./events"

/**
 * Vínculo repositório ↔ Opex: o repositório é o Projeto (`projects`). Só repositórios vinculados
 * aqui são sincronizados. Somente servidor.
 */

type ProjectDoc = IProject & { _id: unknown }

function toDto(doc: ProjectDoc, columns: ReadonlyMap<string, string>, taskCounts: ReadonlyMap<string, number>): GithubLinkDto {
    return {
        id: String(doc._id),
        repo: doc.repo,
        repoUrl: doc.repoUrl,
        name: doc.name,
        sigla: doc.sigla,
        entryColumnKey: doc.entryColumnKey,
        entryColumnName: columns.get(doc.entryColumnKey) ?? null,
        enabled: doc.enabled !== false,
        initialImportAt: doc.initialImportAt ? new Date(doc.initialImportAt).toISOString() : null,
        lastSync: doc.lastSync ? { at: new Date(doc.lastSync.at).toISOString(), ok: doc.lastSync.ok, message: doc.lastSync.message } : null,
        taskCount: taskCounts.get(String(doc._id)) ?? 0,
    }
}

export async function listLinks(): Promise<GithubLinkDto[]> {
    await dbConnect()
    const [projects, columns, counts] = await Promise.all([
        Project.find().sort({ repo: 1 }).lean(),
        TaskBoardColumn.find().select({ key: 1, name: 1 }).lean(),
        DevTask.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$projectId", count: { $sum: 1 } } }]),
    ])
    const columnNames = new Map(columns.map((column) => [column.key, column.name]))
    const taskCounts = new Map(counts.map((item) => [item._id, item.count]))
    return projects.map((project) => toDto(project, columnNames, taskCounts))
}

async function getLinkDto(id: string): Promise<GithubLinkDto> {
    const found = (await listLinks()).find((link) => link.id === id)
    if (!found) throw new DomainError(404, "Vínculo não encontrado", "LINK_NOT_FOUND")
    return found
}

async function assertColumn(key: string): Promise<string> {
    const column = await TaskBoardColumn.findOne({ key }).select({ name: 1 }).lean()
    if (!column) throw new DomainError(400, "A coluna de entrada não existe: escolha uma coluna do quadro", "COLUMN_NOT_FOUND")
    return column.name
}

const auditView = (input: RepoLinkValues, column: string | null) => ({
    repositorio: input.repo,
    coluna: column,
    ativo: input.enabled,
})

export async function createLink(input: RepoLinkValues, actorId: string): Promise<GithubLinkDto> {
    await dbConnect()
    const existing = await Project.findOne({ repo: input.repo }).select({ repo: 1 }).lean()
    if (existing) throw new DomainError(409, `O repositório ${input.repo} já está vinculado`, "LINK_REPO_TAKEN")
    const columnName = await assertColumn(input.entryColumnKey)
    const { apiUrl } = await getIntegrationConfig("github")
    const doc = await Project.create({
        repo: input.repo,
        repoUrl: `${htmlBaseOf(apiUrl)}/${input.repo}`,
        name: projectNameFromRepo(input.repo),
        sigla: siglaFromRepo(input.repo),
        entryColumnKey: input.entryColumnKey,
        enabled: input.enabled,
        taskSeq: 0,
        initialImportAt: null,
        since: null,
        etag: null,
        lastSync: null,
    })
    await recordAudit({ userId: actorId, entidade: GITHUB_AUDIT.link, entidadeId: String(doc._id), acao: AcaoAuditoria.CRIAR, depois: auditView(input, columnName) })
    await publishGithubUpdated("links")
    return getLinkDto(String(doc._id))
}

export async function updateLink(id: string, input: RepoLinkValues, actorId: string): Promise<GithubLinkDto> {
    await dbConnect()
    const before = await Project.findById(id).lean().catch(() => null)
    if (!before) throw new DomainError(404, "Vínculo não encontrado", "LINK_NOT_FOUND")
    const other = await Project.findOne({ repo: input.repo, _id: { $ne: id } }).select({ repo: 1 }).lean()
    if (other) throw new DomainError(409, `O repositório ${input.repo} já está vinculado`, "LINK_REPO_TAKEN")
    const columnName = await assertColumn(input.entryColumnKey)
    const repoChanged = before.repo !== input.repo
    const { apiUrl } = await getIntegrationConfig("github")
    await Project.updateOne(
        { _id: id },
        {
            $set: {
                repo: input.repo,
                repoUrl: `${htmlBaseOf(apiUrl)}/${input.repo}`,
                name: projectNameFromRepo(input.repo),
                sigla: siglaFromRepo(input.repo),
                entryColumnKey: input.entryColumnKey,
                enabled: input.enabled,
                // Outro repositório: recomeça da importação das issues abertas.
                ...(repoChanged ? { initialImportAt: null, since: null, etag: null } : {}),
            },
        },
    )
    const beforeColumn = (await TaskBoardColumn.findOne({ key: before.entryColumnKey }).select({ name: 1 }).lean())?.name ?? null
    await recordAudit({
        userId: actorId,
        entidade: GITHUB_AUDIT.link,
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: auditView(before as unknown as RepoLinkValues, beforeColumn),
        depois: auditView(input, columnName),
    })
    await publishGithubUpdated("links")
    return getLinkDto(id)
}

/** Remove o vínculo (as tarefas criadas ficam; as issues não são mais sincronizadas). */
export async function deleteLink(id: string, actorId: string): Promise<void> {
    await dbConnect()
    const project = await Project.findById(id).lean().catch(() => null)
    if (!project) throw new DomainError(404, "Vínculo não encontrado", "LINK_NOT_FOUND")
    await Project.deleteOne({ _id: id })
    await recordAudit({ userId: actorId, entidade: GITHUB_AUDIT.link, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { repositorio: project.repo } })
    await publishGithubUpdated("links")
}
