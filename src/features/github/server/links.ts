import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { GithubRepoLink, TaskDraft, type IGithubRepoLink, type TaskDraftState } from "@/lib/db/models/Github"
import { TaskBoardColumn } from "@/lib/db/models/TaskBoard"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { TASK_PRIORITY_LABELS, TASK_TYPE_LABELS, type TaskPriority, type TaskType } from "@/features/tasks/constants"
import { GITHUB_AUDIT } from "../constants"
import { htmlBaseOf } from "../logic"
import type { RepoLinkValues } from "../schemas"
import type { GithubRepoLinkDto } from "../types"
import { publishBoardUpdated, publishGithubUpdated } from "./events"
import { upsertSeenPeople } from "./people"

/** Vínculos repositório ↔ produto (um para um). Somente servidor. */

type LinkDoc = IGithubRepoLink & { _id: unknown }

const PENDING = { $in: ["draft", "sending"] as TaskDraftState[] }

function toDto(doc: LinkDoc, columns: ReadonlyMap<string, string>, pending: ReadonlyMap<string, number>): GithubRepoLinkDto {
    return {
        id: String(doc._id),
        repo: doc.repo,
        repoUrl: doc.repoUrl,
        productId: doc.productId,
        productName: doc.productName,
        authors: doc.authors ?? [],
        entryColumnKey: doc.entryColumnKey,
        entryColumnName: columns.get(doc.entryColumnKey) ?? null,
        defaultType: doc.defaultType as TaskType,
        defaultPriority: doc.defaultPriority as TaskPriority,
        enabled: doc.enabled !== false,
        initialImportAt: doc.initialImportAt ? new Date(doc.initialImportAt).toISOString() : null,
        lastSync: doc.lastSync ? { at: new Date(doc.lastSync.at).toISOString(), ok: doc.lastSync.ok, message: doc.lastSync.message } : null,
        pendingDrafts: pending.get(doc.repo) ?? 0,
    }
}

export async function listLinks(): Promise<GithubRepoLinkDto[]> {
    await dbConnect()
    const [links, columns, counts] = await Promise.all([
        GithubRepoLink.find().sort({ repo: 1 }).lean(),
        TaskBoardColumn.find().select({ key: 1, name: 1 }).lean(),
        TaskDraft.aggregate<{ _id: string; count: number }>([{ $match: { state: PENDING } }, { $group: { _id: "$repo", count: { $sum: 1 } } }]),
    ])
    const columnNames = new Map(columns.map((column) => [column.key, column.name]))
    const pending = new Map(counts.map((item) => [item._id, item.count]))
    return links.map((link) => toDto(link as LinkDoc, columnNames, pending))
}

async function getLinkDto(id: string): Promise<GithubRepoLinkDto> {
    const found = (await listLinks()).find((link) => link.id === id)
    if (!found) throw new DomainError(404, "Vínculo não encontrado", "LINK_NOT_FOUND")
    return found
}

async function assertColumn(key: string): Promise<string> {
    const column = await TaskBoardColumn.findOne({ key }).select({ name: 1 }).lean()
    if (!column) throw new DomainError(400, "A coluna de entrada não existe mais: escolha outra coluna pessoal", "COLUMN_NOT_FOUND")
    return column.name
}

async function assertUnique(input: RepoLinkValues, ignoreId?: string): Promise<void> {
    const others = await GithubRepoLink.find(ignoreId ? { _id: { $ne: ignoreId } } : {}).select({ repo: 1, productId: 1, productName: 1 }).lean()
    const repo = others.find((link) => link.repo === input.repo)
    if (repo) throw new DomainError(409, `O repositório ${input.repo} já está vinculado a ${repo.productName}`, "LINK_REPO_TAKEN")
    const product = others.find((link) => link.productId === input.productId)
    if (product) throw new DomainError(409, `O produto ${input.productName} já está vinculado a ${product.repo}`, "LINK_PRODUCT_TAKEN")
}

const auditView = (input: Pick<RepoLinkValues, "repo" | "productName" | "authors" | "defaultType" | "defaultPriority" | "enabled">, column: string | null) => ({
    repositorio: input.repo,
    produto: input.productName,
    autores: input.authors,
    coluna: column,
    tipoPadrao: TASK_TYPE_LABELS[input.defaultType as TaskType] ?? input.defaultType,
    prioridadePadrao: TASK_PRIORITY_LABELS[input.defaultPriority as TaskPriority] ?? input.defaultPriority,
    ativo: input.enabled,
})

export async function createLink(input: RepoLinkValues, actorId: string): Promise<GithubRepoLinkDto> {
    await dbConnect()
    await assertUnique(input)
    const columnName = await assertColumn(input.entryColumnKey)
    const { apiUrl } = await getIntegrationConfig("github")
    const doc = await GithubRepoLink.create({ ...input, repoUrl: `${htmlBaseOf(apiUrl)}/${input.repo}`, initialImportAt: null, since: null, etag: null, lastSync: null })
    await upsertSeenPeople(input.authors.map((login) => ({ login, repo: input.repo })))
    await recordAudit({ userId: actorId, entidade: GITHUB_AUDIT.link, entidadeId: String(doc._id), acao: AcaoAuditoria.CRIAR, depois: auditView(input, columnName) })
    await publishGithubUpdated("links")
    return getLinkDto(String(doc._id))
}

export async function updateLink(id: string, input: RepoLinkValues, actorId: string): Promise<GithubRepoLinkDto> {
    await dbConnect()
    const before = await GithubRepoLink.findById(id).lean().catch(() => null)
    if (!before) throw new DomainError(404, "Vínculo não encontrado", "LINK_NOT_FOUND")
    await assertUnique(input, id)
    const columnName = await assertColumn(input.entryColumnKey)
    const repoChanged = before.repo !== input.repo
    const { apiUrl } = await getIntegrationConfig("github")
    await GithubRepoLink.updateOne(
        { _id: id },
        {
            $set: {
                ...input,
                repoUrl: `${htmlBaseOf(apiUrl)}/${input.repo}`,
                // Outro repositório (ou novos autores) = recomeça da importação das issues abertas.
                ...(repoChanged || input.authors.some((author) => !before.authors.includes(author)) ? { initialImportAt: null, since: null, etag: null } : {}),
            },
        },
    )
    await upsertSeenPeople(input.authors.map((login) => ({ login, repo: input.repo })))
    const beforeColumn = (await TaskBoardColumn.findOne({ key: before.entryColumnKey }).select({ name: 1 }).lean())?.name ?? null
    await recordAudit({
        userId: actorId,
        entidade: GITHUB_AUDIT.link,
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: auditView(before as unknown as RepoLinkValues, beforeColumn),
        depois: auditView(input, columnName),
    })
    // Produto mudou: rascunhos pendentes passam a ser do novo produto.
    if (before.productId !== input.productId) {
        await TaskDraft.updateMany({ repo: before.repo, state: PENDING }, { $set: { productId: input.productId, productName: input.productName, workPackageId: null, workPackageName: null } })
    }
    await publishGithubUpdated("links")
    return getLinkDto(id)
}

/** Remove o vínculo; os rascunhos pendentes ficam (continuam enviáveis) ou são descartados. */
export async function deleteLink(id: string, drafts: "keep" | "discard", actorId: string): Promise<void> {
    await dbConnect()
    const link = await GithubRepoLink.findById(id).lean().catch(() => null)
    if (!link) throw new DomainError(404, "Vínculo não encontrado", "LINK_NOT_FOUND")
    const pending = await TaskDraft.find({ repo: link.repo, state: PENDING }).lean()
    if (drafts === "discard" && pending.length) {
        await TaskDraft.updateMany({ repo: link.repo, state: PENDING }, { $set: { state: "discarded", discardedAt: new Date() } })
    }
    await GithubRepoLink.deleteOne({ _id: id })
    await recordAudit({
        userId: actorId,
        entidade: GITHUB_AUDIT.link,
        entidadeId: id,
        acao: AcaoAuditoria.EXCLUIR,
        antes: { repositorio: link.repo, produto: link.productName },
        depois: { rascunhos: pending.length ? (drafts === "discard" ? `${pending.length} descartado(s)` : `${pending.length} mantido(s)`) : "nenhum" },
    })
    await publishGithubUpdated("links")
    if (drafts === "discard" && pending.length) {
        await publishGithubUpdated("drafts")
        await publishBoardUpdated(pending.map((draft) => `draft-${String(draft._id)}`))
    }
}

/** Vínculos que usam a coluna como entrada (bloqueia a exclusão da coluna). */
export async function linksUsingColumn(key: string): Promise<string[]> {
    await dbConnect()
    return (await GithubRepoLink.find({ entryColumnKey: key }).select({ repo: 1 }).lean()).map((link) => link.repo)
}
