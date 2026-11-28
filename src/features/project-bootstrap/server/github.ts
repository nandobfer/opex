import { dbConnect } from "@/lib/db"
import { Project } from "@/lib/db/models/Project"
import { TaskBoardColumn, TaskBoardLayout } from "@/lib/db/models/TaskBoard"
import { GithubError, githubPaginate, githubRequest } from "@/features/github/client"
import { toGithubDomainError } from "@/features/github/server/errors"
import { ACTIVE_BOOTSTRAP_STATUSES } from "../constants"
import { REPO_NAME_MESSAGE, REPO_OWNER_MESSAGE, isValidRepoName, isValidRepoOwner, repoFullName } from "../repo-name"
import type { RepoCheckDto, RepoOwnersDto } from "../types"
import { ProjectBootstrap } from "./models"

/**
 * GitHub do bootstrap (SOMENTE servidor), com o token da integração GitHub: a conta do token e as
 * organizações acessíveis, a conferência do nome e as colunas iniciais do vínculo.
 */

interface GithubUser {
    login: string
    avatar_url?: string | null
}

interface GithubRepo {
    full_name: string
    private: boolean
    default_branch: string
}

export async function listRepoOwners(): Promise<RepoOwnersDto> {
    try {
        const [viewer, orgs] = await Promise.all([githubRequest<GithubUser>("/user", { label: "bootstrap: conta do token" }), githubPaginate<GithubUser>("/user/orgs?per_page=100", { label: "bootstrap: organizações", maxPages: 5 })])
        return {
            viewer: viewer.login,
            owners: [{ login: viewer.login, kind: "user", avatarUrl: viewer.avatar_url ?? null }, ...orgs.map((org) => ({ login: org.login, kind: "org" as const, avatarUrl: org.avatar_url ?? null }))],
        }
    } catch (error) {
        return toGithubDomainError(error)
    }
}

const check = (repo: string, state: RepoCheckDto["state"], message: string, extra: Partial<RepoCheckDto> = {}): RepoCheckDto => ({
    repo,
    state,
    message,
    blocked: state !== "free" && state !== "existing",
    defaultBranch: null,
    private: null,
    bootstrapId: null,
    ...extra,
})

/**
 * Nome inválido, dono fora do alcance do token, já vinculado ou com bootstrap em andamento: bloqueia.
 * Livre: será criado. Existente e não vinculado: modo repositório existente, com a branch padrão.
 */
export async function checkRepoName(owner: string, name: string, options: { ignoreBootstrapId?: string } = {}): Promise<RepoCheckDto> {
    const repo = repoFullName(owner, name)
    if (!isValidRepoOwner(owner)) return check(repo, "invalid", REPO_OWNER_MESSAGE)
    if (!isValidRepoName(name)) return check(repo, "invalid", REPO_NAME_MESSAGE)
    const owners = await listRepoOwners()
    if (!owners.owners.some((item) => item.login.toLowerCase() === owner.toLowerCase())) {
        return check(repo, "forbidden", `O token do GitHub não tem acesso a ${owner}: escolha a conta ${owners.viewer} ou uma organização do token.`)
    }
    await dbConnect()
    if (await Project.exists({ repo })) return check(repo, "linked", `O repositório ${repo} já está vinculado a um projeto do Opex: escolha-o na lista em vez de criar.`)
    const active = await ProjectBootstrap.findOne({ repo, status: { $in: ACTIVE_BOOTSTRAP_STATUSES }, ...(options.ignoreBootstrapId ? { _id: { $ne: options.ignoreBootstrapId } } : {}) })
        .select({ _id: 1 })
        .lean()
    if (active) return check(repo, "in-progress", `Já há um bootstrap em andamento para ${repo}.`, { bootstrapId: String(active._id) })
    try {
        const found = await githubRequest<GithubRepo>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, { label: "bootstrap: conferir o repositório" })
        return check(repo, "existing", "Este repositório já existe no GitHub: o bootstrap vai usá-lo", { defaultBranch: found.default_branch || "main", private: found.private })
    } catch (error) {
        if (error instanceof GithubError && error.code === "NOT_FOUND") return check(repo, "free", "Nome livre: o repositório será criado.")
        return toGithubDomainError(error)
    }
}

/** Colunas do último vínculo criado; sem vínculo, a primeira coluna do quadro e nenhuma de conclusão. */
export async function initialLinkColumns(): Promise<{ entryColumnKey: string | null; closedColumnKey: string | null }> {
    await dbConnect()
    const last = await Project.findOne().sort({ createdAt: -1, _id: -1 }).select({ entryColumnKey: 1, closedColumnKey: 1 }).lean()
    const columns = await TaskBoardColumn.find().select({ key: 1, createdAt: 1 }).sort({ createdAt: 1 }).lean()
    const keys = new Set(columns.map((column) => column.key))
    if (last && keys.has(last.entryColumnKey)) return { entryColumnKey: last.entryColumnKey, closedColumnKey: last.closedColumnKey && keys.has(last.closedColumnKey) ? last.closedColumnKey : null }
    const layout = await TaskBoardLayout.findOne({ key: "board" }).lean()
    const first = (layout?.order ?? []).find((key) => keys.has(key)) ?? columns[0]?.key ?? null
    return { entryColumnKey: first, closedColumnKey: null }
}
