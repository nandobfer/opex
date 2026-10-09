import { dbConnect } from "@/lib/db"
import { GithubPerson, GithubRepoLink } from "@/lib/db/models/Github"
import { githubPaginate, githubRequest } from "../client"
import type { GithubLabelOption, GithubRepoOption, GithubUserOption } from "../types"
import { toTaskDomainError } from "@/features/tasks/server/service"
import { toGithubDomainError } from "./errors"
import { listGoProducts, type GoProductOption } from "./go-sipal"

/** Opções dos seletores da integração (repositórios, pessoas, labels, Issue Types, produtos). */

const REPOS_TTL_MS = 5 * 60_000
let reposCache: { at: number; repos: GithubRepoOption[] } | null = null

interface RawRepo {
    full_name: string
    html_url: string
    description: string | null
    private: boolean
    owner?: { avatar_url?: string }
}

/** Repositórios do token (dono, colaborador e organizações), em cache por 5 min. */
export async function listGithubRepos(refresh = false): Promise<GithubRepoOption[]> {
    if (!refresh && reposCache && Date.now() - reposCache.at < REPOS_TTL_MS) return reposCache.repos
    try {
        const raw = await githubPaginate<RawRepo>("/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member", { label: "listar repositórios", maxPages: 10 })
        const repos = raw.map((repo) => ({
            fullName: repo.full_name.toLowerCase(),
            htmlUrl: repo.html_url,
            description: repo.description,
            private: repo.private,
            ownerAvatarUrl: repo.owner?.avatar_url ?? null,
        }))
        reposCache = { at: Date.now(), repos }
        return repos
    } catch (error) {
        toGithubDomainError(error)
    }
}

/** Pessoas: já conhecidas (aba Pessoas) + busca no GitHub quando há termo. */
export async function searchGithubUsers(term: string): Promise<GithubUserOption[]> {
    await dbConnect()
    const known = (await GithubPerson.find().sort({ login: 1 }).limit(300).lean()).map((person) => ({ login: person.login, name: person.name ?? null, avatarUrl: person.avatarUrl ?? null }))
    const query = term.trim()
    if (query.length < 2) return known
    try {
        const result = await githubRequest<{ items?: { login: string; avatar_url?: string }[] }>(`/search/users?q=${encodeURIComponent(`${query} in:login in:name`)}&per_page=20`, { label: "buscar pessoas" })
        const remote = (result.items ?? []).map((user) => ({ login: user.login.toLowerCase(), name: null, avatarUrl: user.avatar_url ?? null }))
        const seen = new Set(known.map((person) => person.login))
        return [...known, ...remote.filter((user) => !seen.has(user.login))]
    } catch (error) {
        toGithubDomainError(error)
    }
}

async function linkedRepos(): Promise<string[]> {
    await dbConnect()
    return (await GithubRepoLink.find().select({ repo: 1 }).lean()).map((link) => link.repo)
}

/** Labels dos repositórios vinculados (mesmo nome = uma opção). */
export async function listGithubLabels(): Promise<GithubLabelOption[]> {
    const byName = new Map<string, GithubLabelOption>()
    try {
        for (const repo of await linkedRepos()) {
            const labels = await githubPaginate<{ name: string; color?: string }>(`/repos/${repo}/labels?per_page=100`, { label: `labels de ${repo}`, maxPages: 3 })
            for (const label of labels) {
                const key = label.name.toLowerCase()
                const current = byName.get(key)
                if (current) current.repos.push(repo)
                else byName.set(key, { name: label.name, color: label.color ?? null, repos: [repo] })
            }
        }
    } catch (error) {
        toGithubDomainError(error)
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

/** Issue Types das organizações dos repositórios vinculados (contas pessoais não têm: ignoradas). */
export async function listGithubIssueTypes(): Promise<string[]> {
    const owners = [...new Set((await linkedRepos()).map((repo) => repo.split("/")[0]!))]
    const names = new Set<string>()
    for (const owner of owners) {
        try {
            const types = await githubRequest<{ name: string; is_enabled?: boolean }[]>(`/orgs/${owner}/issue-types`, { label: `issue types de ${owner}` })
            for (const type of types ?? []) if (type.is_enabled !== false) names.add(type.name)
        } catch {
            // Conta pessoal ou sem permissão: sem Issue Types.
        }
    }
    return [...names].sort((a, b) => a.localeCompare(b, "pt-BR"))
}

export interface ProductLinkOption extends GoProductOption {
    /** Repositório já vinculado a este produto (um para um). */
    linkedRepo: string | null
}

export async function listProductOptions(): Promise<ProductLinkOption[]> {
    let products: GoProductOption[]
    try {
        products = await listGoProducts()
    } catch (error) {
        toTaskDomainError(error)
    }
    await dbConnect()
    const links = new Map((await GithubRepoLink.find().select({ productId: 1, repo: 1 }).lean()).map((link) => [link.productId, link.repo]))
    return products.map((product) => ({ ...product, linkedRepo: links.get(product.id) ?? null }))
}
