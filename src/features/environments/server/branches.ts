import { GithubError, githubPaginate } from "@/features/github/client"
import { DomainError } from "@/lib/api/route"
import type { EnvironmentBranchDto } from "../types"

/**
 * Branches reais de um repositório (GitHub), para o seletor com busca do módulo Ambientes (branch do
 * ambiente e filtro do CI/CD). Paginado e ordenado por nome.
 */

interface GithubBranch {
    name: string
    commit?: { sha?: string }
    protected?: boolean
}

export async function listRepositoryBranches(repo: string): Promise<EnvironmentBranchDto[]> {
    if (!repo) return []
    try {
        const branches = await githubPaginate<GithubBranch>(`/repos/${repo}/branches?per_page=100`, { label: "branches", maxPages: 10 })
        return branches
            .filter((branch) => typeof branch?.name === "string" && branch.name.length > 0)
            .map((branch) => ({ name: branch.name, sha: branch.commit?.sha ?? null, protected: Boolean(branch.protected) }))
            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    } catch (error) {
        if (error instanceof GithubError) throw new DomainError(error.status === 404 ? 404 : 502, error.message, error.code)
        throw error
    }
}
