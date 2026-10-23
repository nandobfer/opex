import { githubGraphql } from "@/features/github/client"
import { normalizeRepo } from "@/features/github/logic"
import type { TaskBoardDto } from "@/features/tasks/board"
import type { TaskDto } from "@/features/tasks/types"
import { dbConnect } from "@/lib/db"
import { AgenticWorkbench } from "@/lib/db/models/Agentic"
import { GithubIssueLink } from "@/lib/db/models/Github"
import { Project } from "@/lib/db/models/Project"
import { toIssueNode, type RawNode, type RawRepo } from "../issue-nodes"
import { issueKey, type IssueNode, type IssueRefLite, type LinkedTaskLite } from "../issue-readiness"
import { centralsByRepo } from "./repo-snapshot"

/**
 * Grafo de issues do GitHub para o Agente Opex: carrega em lote (GraphQL, várias issues por
 * consulta) estado, épico, dependências formais e PRs ligados, seguindo "bloqueada por" e "bloqueia"
 * até a profundidade pedida. Somente servidor.
 */

const BATCH = 20
export const ISSUE_GRAPH_MAX_NODES = 200

const LITE = "number title url state stateReason repository { nameWithOwner }"
const PR_FIELDS = "number title url state mergedAt baseRefName repository { nameWithOwner }"

const NODE = `
    ${LITE} closedAt createdAt updatedAt
    assignees(first: 10) { nodes { login } }
    labels(first: 20) { nodes { name } }
    issueType { name }
    milestone { title }
    parent { ${LITE} }
    subIssuesSummary { total completed }
    blockedBy(first: 50) { nodes { ${LITE} assignees(first: 5) { nodes { login } } } }
    blocking(first: 50) { nodes { ${LITE} assignees(first: 5) { nodes { login } } } }
    closedByPullRequestsReferences(first: 10, includeClosedPrs: true) { nodes { ${PR_FIELDS} } }
    timelineItems(last: 60, itemTypes: [CROSS_REFERENCED_EVENT, CONNECTED_EVENT]) {
        nodes {
            ... on CrossReferencedEvent { source { ... on PullRequest { ${PR_FIELDS} } } }
            ... on ConnectedEvent { subject { ... on PullRequest { ${PR_FIELDS} } } }
        }
    }`

/** Issues de um repositório em uma consulta (aliases `i<N>`), com a branch padrão. */
export async function fetchIssueNodes(repo: string, numbers: readonly number[], signal?: AbortSignal): Promise<{ nodes: IssueNode[]; missing: number[]; defaultBranch: string | null }> {
    const [owner, name] = repo.split("/")
    const nodes: IssueNode[] = []
    const missing: number[] = []
    let defaultBranch: string | null = null
    for (let start = 0; start < numbers.length; start += BATCH) {
        const chunk = numbers.slice(start, start + BATCH)
        const query = `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { defaultBranchRef { name } ${chunk.map((number) => `i${number}: issue(number: ${number}) { ${NODE} }`).join("\n")} } }`
        const data = await githubGraphql<{ repository: RawRepo | null }>(query, { owner, name }, { signal, label: "opex: issues" })
        const repository = data?.repository
        defaultBranch = repository?.defaultBranchRef?.name ?? defaultBranch
        for (const number of chunk) {
            const raw = repository?.[`i${number}`] as RawNode | null | undefined
            if (raw && typeof raw === "object" && "number" in raw) nodes.push(toIssueNode(raw, repo))
            else missing.push(number)
        }
    }
    return { nodes, missing, defaultBranch }
}

export interface IssueGraph {
    nodes: Map<string, IssueNode>
    /** Chaves citadas mas não carregadas (fora da profundidade, do limite ou sem acesso). */
    lite: Map<string, IssueRefLite>
    missing: Set<string>
    /** Branches que contam como entrega, por repositório (base/destino da central + padrão). */
    branches: Map<string, Set<string>>
    truncated: boolean
}

export interface GraphOptions {
    /** Níveis de "bloqueada por" a carregar além das sementes. */
    blockedByDepth?: number
    /** Níveis de "bloqueia" a carregar além das sementes. */
    blockingDepth?: number
    maxNodes?: number
    signal?: AbortSignal
}

/** Carrega as sementes e segue as relações nível a nível (cada nível = uma consulta por repositório e lote). */
export async function loadIssueGraph(seeds: readonly { repo: string; number: number }[], options: GraphOptions = {}): Promise<IssueGraph> {
    const maxNodes = options.maxNodes ?? ISSUE_GRAPH_MAX_NODES
    const graph: IssueGraph = { nodes: new Map(), lite: new Map(), missing: new Set(), branches: new Map(), truncated: false }
    const centrals = await centralsByRepo().catch(() => new Map<string, { baseBranch: string; prTargetBranch: string }>())
    const depthOf = new Map<string, { blockedBy: number; blocking: number }>()
    let frontier: string[] = []
    for (const seed of seeds) {
        const key = issueKey(seed.repo, seed.number)
        if (!depthOf.has(key)) {
            depthOf.set(key, { blockedBy: 0, blocking: 0 })
            frontier.push(key)
        }
    }
    while (frontier.length) {
        const pending = frontier.filter((key) => !graph.nodes.has(key) && !graph.missing.has(key))
        const room = maxNodes - graph.nodes.size
        if (pending.length > room) graph.truncated = true
        const toLoad = pending.slice(0, Math.max(0, room))
        const byRepo = new Map<string, number[]>()
        for (const key of toLoad) {
            const at = key.lastIndexOf("#")
            const repo = key.slice(0, at)
            byRepo.set(repo, [...(byRepo.get(repo) ?? []), Number(key.slice(at + 1))])
        }
        for (const [repo, numbers] of byRepo) {
            const { nodes, missing, defaultBranch } = await fetchIssueNodes(repo, numbers, options.signal)
            if (!graph.branches.has(repo)) {
                const central = centrals.get(repo)
                graph.branches.set(repo, new Set([defaultBranch, central?.baseBranch, central?.prTargetBranch].filter((item): item is string => Boolean(item))))
            }
            for (const node of nodes) graph.nodes.set(issueKey(node.repo, node.number), node)
            for (const number of missing) graph.missing.add(issueKey(repo, number))
        }
        const next: string[] = []
        for (const key of toLoad) {
            const node = graph.nodes.get(key)
            const depth = depthOf.get(key)
            if (!node || !depth) continue
            const follow = (refs: IssueRefLite[], step: { blockedBy: number; blocking: number }, allowed: boolean) => {
                for (const ref of refs) {
                    const refKey = issueKey(ref.repo, ref.number)
                    if (!graph.nodes.has(refKey)) graph.lite.set(refKey, ref)
                    if (!allowed || depthOf.has(refKey)) continue
                    depthOf.set(refKey, step)
                    next.push(refKey)
                }
            }
            follow(node.blockedBy, { blockedBy: depth.blockedBy + 1, blocking: depth.blocking }, depth.blockedBy < (options.blockedByDepth ?? 1))
            follow(node.blocking, { blockedBy: depth.blockedBy, blocking: depth.blocking + 1 }, depth.blocking < (options.blockingDepth ?? 0))
            if (node.parent && !graph.nodes.has(issueKey(node.parent.repo, node.parent.number))) graph.lite.set(issueKey(node.parent.repo, node.parent.number), node.parent)
        }
        for (const key of graph.nodes.keys()) graph.lite.delete(key)
        frontier = next
    }
    return graph
}

/** Situação das tarefas para a entrega: coluna (nome), concluída (coluna de conclusão do projeto) e mesa aberta. */
export interface TaskSituation {
    columnName: (task: TaskDto) => string
    concluded: (task: TaskDto) => boolean
    active: (task: TaskDto) => boolean
}

/** Lê as colunas de conclusão dos projetos e as mesas de trabalho abertas (não concluídas). */
export async function loadTaskSituation(tasks: readonly TaskDto[], board: Pick<TaskBoardDto, "columns"> | null): Promise<TaskSituation> {
    await dbConnect()
    const projectIds = [...new Set(tasks.map((task) => task.project?.id).filter((id): id is string => Boolean(id)))]
    const [projects, workbenches] = await Promise.all([
        Project.find({ _id: { $in: projectIds } }).select({ closedColumnKey: 1 }).lean(),
        AgenticWorkbench.find({ taskId: { $in: tasks.map((task) => task.id) }, stage: { $ne: "done" } }).select({ taskId: 1 }).lean(),
    ])
    const closed = new Map(projects.map((project) => [String(project._id), project.closedColumnKey ?? null]))
    const active = new Set(workbenches.map((workbench) => String(workbench.taskId)))
    const names = new Map((board?.columns ?? []).map((column) => [column.key, column.name]))
    return {
        columnName: (task) => names.get(task.columnId) ?? task.columnId,
        concluded: (task) => Boolean(task.project && closed.get(task.project.id) === task.columnId),
        active: (task) => active.has(task.id),
    }
}

/** Tarefas por issue vinculada (uma tarefa por issue). */
export function linkedTasksByIssue(tasks: readonly TaskDto[], situation: TaskSituation): Map<string, LinkedTaskLite & { title: string; dto: TaskDto }> {
    const map = new Map<string, LinkedTaskLite & { title: string; dto: TaskDto }>()
    for (const task of tasks) {
        if (!task.issue) continue
        const key = issueKey(task.issue.repo, task.issue.number)
        if (map.has(key)) continue
        map.set(key, { id: task.id, code: task.code, column: situation.columnName(task), concluded: situation.concluded(task), active: situation.active(task), title: task.title, dto: task })
    }
    return map
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** `dono/nome` ou só `nome` → filtro do Mongo (repositórios ficam em minúsculas). */
function repoFilter(repo: string): string | { $regex: string } {
    const full = normalizeRepo(repo)
    return full ?? { $regex: `/${escapeRegex(repo.trim().toLowerCase())}$` }
}

/** Tarefa do Opex vinculada a uma issue (`repo#N`). */
export async function findIssueTask(repo: string, number: number): Promise<{ id: string } | null> {
    await dbConnect()
    const link = await GithubIssueLink.findOne({ repo: repoFilter(repo), number }).select({ taskId: 1 }).lean()
    return link?.taskId ? { id: link.taskId } : null
}
