import { dbConnect } from "@/lib/db"
import { AgenticCentral, AgenticWorkbench } from "@/lib/db/models/Agentic"
import { Project } from "@/lib/db/models/Project"
import { githubRequest } from "@/features/github/client"
import { parseCentralConfig } from "@/features/agentic/logic"
import type { CentralConfig } from "@/features/agentic/schemas"
import { parsePrUrl } from "../logic"

/** Repositórios das centrais (alvo da revisão), usuário do token e PRs das mesas. */

export interface ReviewTarget {
    centralId: string
    projectName: string
    repo: string
    config: CentralConfig
}

/** Centrais com repositório vinculado (Integrações › GitHub › Vínculos). Desativadas incluídas só com `all`. */
export async function listReviewTargets(options: { all?: boolean } = {}): Promise<ReviewTarget[]> {
    await dbConnect()
    const [centrals, projects] = await Promise.all([AgenticCentral.find().sort({ projectName: 1 }).lean(), Project.find().select({ repo: 1 }).lean()])
    const repoOf = new Map(projects.map((project) => [String(project._id), project.repo.toLowerCase()]))
    const targets: ReviewTarget[] = []
    for (const central of centrals) {
        const repo = repoOf.get(central.projectId)
        if (!repo) continue
        const config = parseCentralConfig(central.config)
        if (!config.enabled && !options.all) continue
        targets.push({ centralId: String(central._id), projectName: central.projectName, repo, config })
    }
    return targets
}

export async function findReviewTarget(repo: string): Promise<ReviewTarget | null> {
    return (await listReviewTargets()).find((target) => target.repo === repo.toLowerCase()) ?? null
}

const LOGIN_TTL_MS = 10 * 60_000
const loginCache = globalThis as unknown as { __prReviewLogin?: { login: string | null; at: number } }

/** Login do usuário do token do GitHub (cache de 10 min); `null` sem token ou com falha. */
export async function githubLogin(): Promise<string | null> {
    const cached = loginCache.__prReviewLogin
    if (cached && Date.now() - cached.at < LOGIN_TTL_MS) return cached.login
    try {
        const user = await githubRequest<{ login: string }>("/user")
        loginCache.__prReviewLogin = { login: user.login ?? null, at: Date.now() }
        return user.login ?? null
    } catch {
        return null
    }
}

/** `org/repo#N` → id da mesa dona do PR (mesas não concluídas). */
export async function workbenchPrIndex(): Promise<Map<string, string>> {
    await dbConnect()
    const docs = await AgenticWorkbench.find({ pr: { $ne: null } }).select({ _id: 1, pr: 1 }).lean()
    const index = new Map<string, string>()
    for (const doc of docs) {
        const parsed = doc.pr?.url ? parsePrUrl(doc.pr.url) : null
        if (parsed) index.set(`${parsed.repo}#${parsed.number}`, String(doc._id))
    }
    return index
}
