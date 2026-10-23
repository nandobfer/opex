import { z } from "zod"
import { GithubError, githubGraphql, githubPaginate, githubRequest } from "@/features/github/client"
import { getBoard } from "@/features/tasks/server/columns"
import { listTasks } from "@/features/tasks/server/service"
import type { TaskDto } from "@/features/tasks/types"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { OPEX_GITHUB_AUDIT_ENTITY } from "../../constants"
import {
    compareRank,
    deliveryOf,
    issueKey,
    issueLabel,
    isResolved,
    normalizeTitle,
    similarPairs,
    unlocksOf,
    verdictOf,
    VERDICTS,
    type DeliveredAt,
    type Delivery,
    type IssueRefLite,
    type LinkedTaskLite,
    type Verdict,
} from "../../issue-readiness"
import { linkedTasksByIssue, loadIssueGraph, loadTaskSituation, type IssueGraph, type TaskSituation } from "../issue-graph"
import { parseRepo } from "../repo-snapshot"
import { defineTool, OpexToolError } from "./define"
import { withContext } from "./github"
import { clipText } from "./helpers"

const repo = z.string().trim().min(3).max(200).describe("Repositório no formato dono/nome (de list_repositories ou do campo issue das tarefas)")
const issueNumber = z.number().int().min(1).describe("Número da issue")
const deliveredAt = z
    .enum(["merged", "done"])
    .optional()
    .describe('O que conta como entregue: "merged" (padrão: PR mesclado na branch base/destino da central ou na padrão) ou "done" (issue fechada ou tarefa na coluna de conclusão do projeto)')

type Linked = Map<string, LinkedTaskLite & { title: string; dto: TaskDto }>

/** Tarefas do quadro e o vínculo issue → tarefa. Sem as tarefas, segue só com o GitHub. */
async function loadBoard(): Promise<{ tasks: TaskDto[]; situation: TaskSituation | null; linked: Linked; warning: string | null }> {
    try {
        const [list, board] = await Promise.all([listTasks(true), getBoard().catch(() => null)])
        const situation = await loadTaskSituation(list.tasks, board)
        return { tasks: list.tasks, situation, linked: linkedTasksByIssue(list.tasks, situation), warning: null }
    } catch (error) {
        return { tasks: [], situation: null, linked: new Map(), warning: `Tarefas do Opex indisponíveis (${error instanceof Error ? error.message : String(error)}): a entrega considera só o GitHub.` }
    }
}

/** Entrega de uma issue do grafo (carregada, só citada ou inacessível). */
function makeDelivery(graph: IssueGraph, linked: Linked) {
    const cache = new Map<string, Delivery>()
    return (key: string): Delivery => {
        const cached = cache.get(key)
        if (cached) return cached
        const task = linked.get(key) ?? null
        const node = graph.nodes.get(key)
        const lite = graph.lite.get(key)
        let result: Delivery
        if (node) result = deliveryOf(node, task, graph.branches.get(node.repo) ?? null)
        else if (lite && (lite.state === "closed" || (task && (task.concluded || task.active)))) result = deliveryOf({ ...lite, prs: [] }, task, null)
        else result = { state: "unknown", evidence: lite ? "Issue aberta não carregada (além da profundidade ou do limite): confira com get_issue_dependencies" : "Issue não encontrada ou sem acesso pelo token" }
        cache.set(key, result)
        return result
    }
}

function refOf(graph: IssueGraph, key: string): IssueRefLite | null {
    return graph.nodes.get(key) ?? graph.lite.get(key) ?? null
}

/** Issue relacionada no formato enxuto para o modelo. */
function related(graph: IssueGraph, linked: Linked, delivery: (key: string) => Delivery, key: string, baseRepo: string, mode: DeliveredAt) {
    const ref = refOf(graph, key)
    const at = key.lastIndexOf("#")
    const result = delivery(key)
    const task = linked.get(key)
    return {
        issue: issueLabel(key.slice(0, at), Number(key.slice(at + 1)), baseRepo),
        title: ref?.title ?? null,
        state: ref?.state ?? null,
        assignees: ref?.assignees ?? [],
        delivery: result.state,
        evidence: result.evidence,
        resolved: isResolved(result.state, mode),
        ...(task ? { task: task.code, taskColumn: task.column, taskConcluded: task.concluded, taskActive: task.active } : {}),
    }
}

const relationKeys = (refs: readonly IssueRefLite[]) => refs.map((ref) => issueKey(ref.repo, ref.number))

async function issueDbId(repoName: string, number: number, signal?: AbortSignal): Promise<number> {
    const issue = await withContext(`Issue ${repoName}#${number}`, () => githubRequest<{ id: number; pull_request?: unknown }>(`/repos/${repoName}/issues/${number}`, { signal, label: "opex: issue" }))
    if (issue.pull_request) throw new OpexToolError(`${repoName}#${number} é um pull request, não uma issue.`)
    return issue.id
}

async function auditRelation(actorId: string, repoName: string, acao: (typeof AcaoAuditoria)[keyof typeof AcaoAuditoria], depois: Record<string, unknown>) {
    await recordAudit({ userId: actorId, entidade: OPEX_GITHUB_AUDIT_ENTITY, entidadeId: repoName, acao, depois: { ...depois, via: "opex" } })
}

function rejected(what: string) {
    return (error: unknown): never => {
        if (error instanceof GithubError && error.status === 422) throw new OpexToolError(`${what}: o GitHub recusou (${error.message}).`)
        throw error
    }
}

interface RestIssue {
    number: number
    title: string
    state: string
    state_reason?: string | null
    html_url: string
    updated_at: string
    comments: number
    user?: { login: string } | null
    assignees?: { login: string }[]
    labels?: (string | { name?: string })[]
    milestone?: { title: string; number: number } | null
    type?: { name: string } | null
    pull_request?: unknown
    issue_dependencies_summary?: { total_blocked_by?: number; total_blocking?: number; blocked_by?: number; blocking?: number }
    sub_issues_summary?: { total?: number; completed?: number }
    body?: string | null
}

const slimRestIssue = (issue: RestIssue) => ({
    number: issue.number,
    title: issue.title,
    state: issue.state,
    stateReason: issue.state_reason ?? null,
    type: issue.type?.name ?? null,
    assignees: (issue.assignees ?? []).map((item) => item.login),
    labels: (issue.labels ?? []).map((label) => (typeof label === "string" ? label : (label.name ?? ""))).filter(Boolean),
    milestone: issue.milestone?.title ?? null,
    blockedBy: issue.issue_dependencies_summary?.blocked_by ?? 0,
    blocking: issue.issue_dependencies_summary?.blocking ?? 0,
    subIssues: issue.sub_issues_summary?.total ?? 0,
    comments: issue.comments,
    url: issue.html_url,
    updatedAt: issue.updated_at,
})

const quote = (value: string) => (/\s/.test(value) ? `"${value.replace(/"/g, "")}"` : value)

const readTools = [
    defineTool({
        name: "get_issue",
        group: "issues",
        label: "Ler issue",
        risk: "read",
        description:
            "Lê uma issue do GitHub: corpo, estado, labels, tipo, milestone, responsáveis, épico (parent) e sub-issues, dependências formais (bloqueada por / bloqueia) com a entrega de cada uma, PRs ligados, a tarefa do Opex vinculada e os últimos comentários.",
        input: z.object({ repo, number: issueNumber, comments: z.boolean().optional().describe("Padrão true: inclui os últimos 20 comentários") }),
        execute: async ({ repo: rawRepo, number, comments }, context) => {
            const repoName = parseRepo(rawRepo)
            const key = issueKey(repoName, number)
            const [graph, board, rest, thread] = await Promise.all([
                loadIssueGraph([{ repo: repoName, number }], { blockedByDepth: 1, signal: context.signal }),
                loadBoard(),
                withContext(`Issue ${repoName}#${number}`, () => githubRequest<RestIssue>(`/repos/${repoName}/issues/${number}`, { signal: context.signal, label: "opex: issue" })),
                comments === false
                    ? Promise.resolve([])
                    : githubPaginate<{ user?: { login: string } | null; created_at: string; body?: string | null }>(`/repos/${repoName}/issues/${number}/comments?per_page=100`, { signal: context.signal, label: "opex: comentários", maxPages: 3 }),
            ])
            if (rest.pull_request) throw new OpexToolError(`${repoName}#${number} é um pull request, não uma issue: use get_commit/compare_refs.`)
            const node = graph.nodes.get(key)
            if (!node) throw new OpexToolError(`Issue ${repoName}#${number} não encontrada (ou o token não tem acesso).`)
            const delivery = makeDelivery(graph, board.linked)
            const task = board.linked.get(key)
            return {
                repo: repoName,
                number,
                title: node.title,
                url: node.url,
                state: node.state,
                stateReason: node.stateReason,
                closedAt: node.closedAt,
                author: rest.user?.login ?? null,
                issueType: node.issueType,
                labels: node.labels,
                milestone: node.milestone,
                assignees: node.assignees,
                epic: node.parent ? { issue: issueLabel(node.parent.repo, node.parent.number, repoName), title: node.parent.title, state: node.parent.state } : null,
                subIssues: node.subIssues,
                delivery: delivery(key),
                task: task ? { id: task.id, code: task.code, column: task.column, concluded: task.concluded, active: task.active } : null,
                blockedBy: relationKeys(node.blockedBy).map((item) => related(graph, board.linked, delivery, item, repoName, "merged")),
                blocking: relationKeys(node.blocking).map((item) => related(graph, board.linked, delivery, item, repoName, "merged")),
                pullRequests: node.prs,
                body: clipText(rest.body ?? "", 12_000),
                comments: thread.slice(-20).map((item) => ({ author: item.user?.login ?? null, createdAt: item.created_at, body: clipText(item.body ?? "", 2000) })),
                ...(board.warning ? { warning: board.warning } : {}),
            }
        },
    }),
    defineTool({
        name: "list_issues",
        group: "issues",
        label: "Listar issues",
        risk: "read",
        description:
            "Lista issues de um repositório (sem PRs), com filtros: estado, responsável (login, \"none\" ou \"*\"), labels, milestone, sub-issues de um épico (parent) e texto (query, busca no título e no corpo). Traz as contagens de dependências e sub-issues; use get_issue para os detalhes.",
        input: z.object({
            repo,
            state: z.enum(["open", "closed", "all"]).optional().describe("Padrão open"),
            assignee: z.string().trim().max(100).optional().describe('Login do GitHub, "none" (sem responsável) ou "*" (qualquer)'),
            labels: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
            milestone: z.string().trim().max(200).optional().describe('Título ou número do milestone, "none" ou "*"'),
            parent: z.number().int().min(1).optional().describe("Só as sub-issues deste épico"),
            query: z.string().trim().max(200).optional().describe("Texto no título ou corpo"),
            limit: z.number().int().min(1).max(100).optional().describe("Padrão 30"),
        }),
        execute: async (input, context) => {
            const repoName = parseRepo(input.repo)
            const state = input.state ?? "open"
            const limit = input.limit ?? 30
            if (input.parent) {
                const data = await githubGraphql<{ repository: { issue: { title: string; subIssues: { nodes: { number: number; title: string; state: string; stateReason: string | null; url: string; updatedAt: string; assignees: { nodes: { login: string }[] }; labels: { nodes: { name: string }[] }; milestone: { title: string } | null; repository: { nameWithOwner: string } }[] } } | null } | null }>(
                    `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { issue(number: $number) { title subIssues(first: 100) { nodes { number title state stateReason url updatedAt repository { nameWithOwner } assignees(first: 10) { nodes { login } } labels(first: 20) { nodes { name } } milestone { title } } } } } }`,
                    { owner: repoName.split("/")[0], name: repoName.split("/")[1], number: input.parent },
                    { signal: context.signal, label: "opex: sub-issues" },
                )
                const issue = data?.repository?.issue
                if (!issue) throw new OpexToolError(`Issue ${repoName}#${input.parent} não encontrada (ou o token não tem acesso).`)
                const term = input.query ? normalizeTitle(input.query) : null
                const items = issue.subIssues.nodes
                    .map((item) => ({
                        issue: issueLabel(item.repository.nameWithOwner.toLowerCase(), item.number, repoName),
                        number: item.number,
                        title: item.title,
                        state: item.state.toLowerCase(),
                        stateReason: item.stateReason?.toLowerCase() ?? null,
                        assignees: item.assignees.nodes.map((person) => person.login),
                        labels: item.labels.nodes.map((label) => label.name),
                        milestone: item.milestone?.title ?? null,
                        url: item.url,
                        updatedAt: item.updatedAt,
                    }))
                    .filter((item) => state === "all" || item.state === state)
                    .filter((item) => !input.assignee || (input.assignee === "*" ? item.assignees.length > 0 : input.assignee === "none" ? item.assignees.length === 0 : item.assignees.some((login) => login.toLowerCase() === input.assignee!.toLowerCase())))
                    .filter((item) => !input.labels?.length || input.labels.every((label) => item.labels.some((name) => name.toLowerCase() === label.toLowerCase())))
                    .filter((item) => !input.milestone || (input.milestone === "none" ? !item.milestone : input.milestone === "*" ? Boolean(item.milestone) : item.milestone?.toLowerCase() === input.milestone.toLowerCase()))
                    .filter((item) => !term || normalizeTitle(item.title).includes(term))
                return { repo: repoName, parent: { number: input.parent, title: issue.title }, total: items.length, issues: items.slice(0, limit) }
            }
            if (input.query) {
                const terms = [input.query, `repo:${repoName}`, "is:issue"]
                if (state !== "all") terms.push(`is:${state}`)
                if (input.assignee === "none") terms.push("no:assignee")
                else if (input.assignee === "*") terms.push("is:assigned")
                else if (input.assignee) terms.push(`assignee:${input.assignee}`)
                for (const label of input.labels ?? []) terms.push(`label:${quote(label)}`)
                if (input.milestone === "none") terms.push("no:milestone")
                else if (input.milestone && input.milestone !== "*") terms.push(`milestone:${quote(input.milestone)}`)
                const params = new URLSearchParams({ q: terms.join(" "), per_page: String(limit), sort: "updated", order: "desc" })
                const result = await withContext(`Busca em ${repoName}`, () => githubRequest<{ total_count: number; items: RestIssue[] }>(`/search/issues?${params}`, { signal: context.signal, label: "opex: buscar issues" }))
                return { repo: repoName, total: result.total_count, issues: result.items.filter((item) => !item.pull_request).map(slimRestIssue) }
            }
            const params = new URLSearchParams({ state, per_page: "100", sort: "updated", direction: "desc" })
            if (input.assignee) params.set("assignee", input.assignee)
            if (input.labels?.length) params.set("labels", input.labels.join(","))
            if (input.milestone) {
                if (/^\d+$/.test(input.milestone) || input.milestone === "none" || input.milestone === "*") params.set("milestone", input.milestone)
                else {
                    const milestones = await withContext(`Milestones de ${repoName}`, () => githubPaginate<{ number: number; title: string }>(`/repos/${repoName}/milestones?state=all&per_page=100`, { signal: context.signal, label: "opex: milestones", maxPages: 3 }))
                    const found = milestones.find((item) => item.title.toLowerCase() === input.milestone!.toLowerCase())
                    if (!found) throw new OpexToolError(`Milestone "${input.milestone}" não existe em ${repoName}. Existentes: ${milestones.map((item) => item.title).join(", ") || "nenhum"}.`)
                    params.set("milestone", String(found.number))
                }
            }
            const items = await withContext(`Issues de ${repoName}`, () => githubPaginate<RestIssue>(`/repos/${repoName}/issues?${params}`, { signal: context.signal, label: "opex: issues", maxPages: Math.ceil(limit / 100) + 1 }))
            const issues = items.filter((item) => !item.pull_request)
            return { repo: repoName, total: issues.length, issues: issues.slice(0, limit).map(slimRestIssue) }
        },
    }),
    defineTool({
        name: "get_issue_dependencies",
        group: "issues",
        label: "Dependências da issue",
        risk: "read",
        description:
            "Dependências formais de uma issue do GitHub (bloqueada por / bloqueia), em árvore até a profundidade pedida, com a entrega de cada uma: done (fechada ou tarefa na coluna de conclusão do projeto), merged (PR mesclado na branch base/destino da central ou na padrão), in_progress (tarefa com mesa de trabalho aberta ou PR aberto), pending, cancelled ou unknown. Diz se a issue está pronta para começar.",
        input: z.object({
            repo,
            number: issueNumber,
            depth: z.number().int().min(1).max(5).optional().describe("Níveis de \"bloqueada por\" (padrão 2)"),
            deliveredAt,
        }),
        execute: async ({ repo: rawRepo, number, depth: rawDepth, deliveredAt: rawMode }, context) => {
            const repoName = parseRepo(rawRepo)
            const depth = rawDepth ?? 2
            const mode = rawMode ?? "merged"
            const key = issueKey(repoName, number)
            const [graph, board] = await Promise.all([loadIssueGraph([{ repo: repoName, number }], { blockedByDepth: depth, blockingDepth: 1, signal: context.signal }), loadBoard()])
            const node = graph.nodes.get(key)
            if (!node) throw new OpexToolError(`Issue ${repoName}#${number} não encontrada (ou o token não tem acesso).`)
            const delivery = makeDelivery(graph, board.linked)
            type Branch = ReturnType<typeof related> & { blockedBy?: Branch[]; cycle?: true; notLoaded?: number }
            const tree = (current: string, level: number, path: Set<string>): Branch => {
                const item: Branch = related(graph, board.linked, delivery, current, repoName, mode)
                if (path.has(current)) return { ...item, cycle: true }
                const children = relationKeys(graph.nodes.get(current)?.blockedBy ?? [])
                if (!children.length) return item
                if (level >= depth) return { ...item, notLoaded: children.length }
                const nextPath = new Set(path).add(current)
                return { ...item, blockedBy: children.map((child) => tree(child, level + 1, nextPath)) }
            }
            const blockers = relationKeys(node.blockedBy)
            const own = delivery(key)
            const verdict = verdictOf(own.state, node.subIssues.total > 0, blockers.map((item) => delivery(item).state), mode)
            const resolved = (item: string) => isResolved(delivery(item).state, mode)
            return {
                issue: issueLabel(repoName, number, repoName),
                repo: repoName,
                title: node.title,
                delivery: own,
                verdict,
                deliveredAt: mode,
                epic: node.parent ? issueLabel(node.parent.repo, node.parent.number, repoName) : null,
                subIssues: node.subIssues,
                waitingOn: blockers.filter((item) => !resolved(item)).map((item) => issueLabel(item.slice(0, item.lastIndexOf("#")), Number(item.slice(item.lastIndexOf("#") + 1)), repoName)),
                blockedBy: blockers.map((item) => tree(item, 1, new Set([key]))),
                blocking: relationKeys(node.blocking).map((item) => related(graph, board.linked, delivery, item, repoName, mode)),
                truncated: graph.truncated,
                ...(board.warning ? { warning: board.warning } : {}),
            }
        },
    }),
    defineTool({
        name: "rank_ready_tasks",
        group: "issues",
        label: "Qual tarefa começar",
        risk: "read",
        description:
            "Ranqueia as tarefas abertas do Opex (não arquivadas e fora da coluna de conclusão do projeto) pelo que dá para começar agora: lê as dependências formais da issue de cada uma (bloqueada por / bloqueia), a entrega de cada dependência e quantas issues cada tarefa destrava. Veredito: ready, partial (só falta o que está em andamento), unknown, blocked, delivered (já entregue) ou epic. Também aponta gargalos sem responsável nem tarefa, issues entregues mas não fechadas, tarefas já entregues e títulos parecidos (possíveis duplicadas). Use para \"qual tarefa começo?\".",
        input: z.object({
            projectIds: z.array(z.string()).max(20).optional().describe("Só estes projetos (de get_task_options)"),
            columns: z.array(z.string()).max(20).optional().describe("Só estas colunas (chaves do quadro, de get_task_options)"),
            epic: z.number().int().min(1).optional().describe("Só as sub-issues deste épico"),
            deliveredAt,
            limit: z.number().int().min(1).max(50).optional().describe("Padrão 15"),
        }),
        execute: async (input, context) => {
            const board = await loadBoard()
            if (board.warning) throw new OpexToolError(board.warning)
            const mode = input.deliveredAt ?? "merged"
            const situation = board.situation!
            const isOpen = (task: TaskDto) => !task.archived && !situation.concluded(task)
            const candidates = board.tasks.filter(
                (task) =>
                    isOpen(task) &&
                    (!input.projectIds?.length || (task.project && input.projectIds.includes(task.project.id))) &&
                    (!input.columns?.length || input.columns.includes(task.columnId)),
            )
            const byIssue = new Map<string, TaskDto>()
            const withoutIssue: TaskDto[] = []
            for (const task of candidates) {
                const ref = task.issue ?? null
                if (!ref) {
                    withoutIssue.push(task)
                    continue
                }
                const key = issueKey(ref.repo, ref.number)
                if (!byIssue.has(key)) byIssue.set(key, task)
            }
            const seeds = [...byIssue.keys()].map((key) => ({ repo: key.slice(0, key.lastIndexOf("#")), number: Number(key.slice(key.lastIndexOf("#") + 1)) }))
            const graph = seeds.length ? await loadIssueGraph(seeds, { blockedByDepth: 2, blockingDepth: 3, signal: context.signal }) : null
            if (!graph) return { deliveredAt: mode, analyzed: 0, ranking: [], withoutIssue: withoutIssue.map((task) => ({ code: task.code, title: task.title, column: situation.columnName(task) })) }

            const delivery = makeDelivery(graph, board.linked)
            const resolved = (key: string) => isResolved(delivery(key).state, mode)
            const blockingOf = (key: string) => relationKeys(graph.nodes.get(key)?.blocking ?? [])
            const label = (key: string, baseRepo: string) => issueLabel(key.slice(0, key.lastIndexOf("#")), Number(key.slice(key.lastIndexOf("#") + 1)), baseRepo)

            const rows = [...byIssue.entries()]
                .map(([key, task]) => {
                    const node = graph.nodes.get(key)
                    const repoName = key.slice(0, key.lastIndexOf("#"))
                    const number = Number(key.slice(key.lastIndexOf("#") + 1))
                    const own = delivery(key)
                    const blockers = relationKeys(node?.blockedBy ?? [])
                    const verdict: Verdict = node ? verdictOf(own.state, node.subIssues.total > 0, blockers.map((item) => delivery(item).state), mode) : "unknown"
                    const unlocks = unlocksOf(key, blockingOf, resolved)
                    return { key, task, node, repoName, number, own, blockers, verdict, unlocks }
                })
                .filter((row) => !input.epic || row.node?.parent?.number === input.epic)
                .sort((a, b) =>
                    compareRank(
                        { key: a.key, verdict: a.verdict, unlocksTotal: a.unlocks.total.length, unlocksDirect: a.unlocks.direct.length, priority: a.task.priority, estimateHours: a.task.estimate?.hours ?? null, number: a.number },
                        { key: b.key, verdict: b.verdict, unlocksTotal: b.unlocks.total.length, unlocksDirect: b.unlocks.direct.length, priority: b.task.priority, estimateHours: b.task.estimate?.hours ?? null, number: b.number },
                    ),
                )

            const ranking = rows.slice(0, input.limit ?? 15).map((row, index) => ({
                position: index + 1,
                code: row.task.code,
                title: row.task.title,
                issue: `${row.repoName}#${row.number}`,
                url: row.node?.url ?? row.task.issue?.url ?? null,
                column: situation.columnName(row.task),
                priority: row.task.priority,
                estimateHours: row.task.estimate?.hours ?? null,
                verdict: row.verdict,
                delivery: row.own.state === "pending" ? undefined : row.own,
                epic: row.node?.parent ? label(issueKey(row.node.parent.repo, row.node.parent.number), row.repoName) : null,
                waitingOn: row.blockers.filter((item) => !resolved(item)).map((item) => related(graph, board.linked, delivery, item, row.repoName, mode)),
                resolvedBlockers: row.blockers.filter(resolved).map((item) => `${label(item, row.repoName)} (${delivery(item).state})`),
                unlocks: { direct: row.unlocks.direct.map((item) => label(item, row.repoName)), total: row.unlocks.total.length, all: row.unlocks.total.slice(0, 20).map((item) => label(item, row.repoName)) },
                ...(row.node ? {} : { note: "Issue não carregada (sem acesso ou excluída)" }),
            }))

            // Gargalos: bloqueadoras não resolvidas, sem responsável no GitHub nem tarefa no Opex, que já podem começar.
            const bottlenecks = new Map<string, { blocks: Set<string>; baseRepo: string }>()
            for (const row of rows) {
                for (const item of row.blockers) {
                    if (resolved(item)) continue
                    const node = graph.nodes.get(item)
                    const task = board.linked.get(item)
                    if (!node || node.assignees.length || task) continue
                    const entry = bottlenecks.get(item) ?? { blocks: new Set<string>(), baseRepo: row.repoName }
                    entry.blocks.add(row.task.code)
                    bottlenecks.set(item, entry)
                }
            }
            const unassignedBottlenecks = [...bottlenecks.entries()]
                .map(([key, entry]) => {
                    const node = graph.nodes.get(key)!
                    const verdict = verdictOf(delivery(key).state, node.subIssues.total > 0, relationKeys(node.blockedBy).map((item) => delivery(item).state), mode)
                    return { issue: label(key, entry.baseRepo), title: node.title, verdict, blocks: [...entry.blocks], unlocksTotal: unlocksOf(key, blockingOf, resolved).total.length }
                })
                .sort((a, b) => b.blocks.length - a.blocks.length || b.unlocksTotal - a.unlocksTotal)

            const seen = new Set<string>()
            const deliveredNotClosed: { issue: string; title: string; task: string | null; taskColumn: string | null; pr: string | null }[] = []
            for (const row of rows) {
                for (const item of [row.key, ...row.blockers]) {
                    if (seen.has(item)) continue
                    seen.add(item)
                    const node = graph.nodes.get(item)
                    const result = delivery(item)
                    if (!node || node.state !== "open" || result.state !== "merged") continue
                    deliveredNotClosed.push({ issue: label(item, row.repoName), title: node.title, task: result.task?.code ?? null, taskColumn: result.task?.column ?? null, pr: result.pr?.url ?? null })
                }
            }

            const deliveredItems = rows.filter((row) => row.verdict === "delivered").map((row) => ({ code: row.task.code, evidence: row.own.evidence }))

            const itemKeys = new Set(rows.map((row) => row.key))
            const projectIds = new Set(rows.map((row) => row.task.project?.id).filter(Boolean))
            const pool = board.tasks
                .filter((task) => isOpen(task) && task.project && projectIds.has(task.project.id))
                .map((task) => ({ key: task.issue ? issueKey(task.issue.repo, task.issue.number) : task.id, title: task.title, code: task.code }))
            const uniquePool = [...new Map(pool.map((item) => [item.key, item])).values()]
            const similarTitles = similarPairs(uniquePool)
                .filter((pair) => pair.a.key !== pair.b.key && (itemKeys.has(pair.a.key) || itemKeys.has(pair.b.key)))
                .slice(0, 10)
                .map((pair) => ({ a: { code: pair.a.code, title: pair.a.title }, b: { code: pair.b.code, title: pair.b.title }, score: pair.score }))

            const counts = Object.fromEntries(VERDICTS.map((verdict) => [verdict, rows.filter((row) => row.verdict === verdict).length]))
            return {
                deliveredAt: mode,
                analyzed: rows.length,
                counts,
                ranking,
                withoutIssue: withoutIssue.map((task) => ({ code: task.code, title: task.title, column: situation.columnName(task) })),
                alerts: {
                    unassignedBottlenecks,
                    deliveredNotClosed,
                    deliveredItems,
                    similarTitles,
                },
                truncated: graph.truncated,
            }
        },
    }),
]

const relationInput = z.object({
    repo,
    number: issueNumber.describe("Issue que fica bloqueada"),
    blockedBy: z.number().int().min(1).describe("Issue que bloqueia"),
    blockedByRepo: z.string().trim().min(3).max(200).optional().describe("Repositório da issue que bloqueia (padrão: o mesmo)"),
})

const subIssueInput = z.object({
    repo,
    parent: z.number().int().min(1).describe("Épico (issue pai)"),
    subIssue: z.number().int().min(1).describe("Sub-issue"),
    subIssueRepo: z.string().trim().min(3).max(200).optional().describe("Repositório da sub-issue (padrão: o mesmo)"),
})

const writeTools = [
    defineTool({
        name: "add_issue_dependency",
        group: "issues",
        label: "Adicionar dependência",
        risk: "write",
        confirmByDefault: true,
        description: "Registra no GitHub que uma issue é bloqueada por outra (relação formal \"bloqueada por\").",
        input: relationInput,
        summarize: (input) => `Marcar ${input.repo}#${input.number} como bloqueada por ${input.blockedByRepo ?? input.repo}#${input.blockedBy}`,
        execute: async ({ repo: rawRepo, number, blockedBy, blockedByRepo }, context) => {
            const repoName = parseRepo(rawRepo)
            const blockerRepo = blockedByRepo ? parseRepo(blockedByRepo) : repoName
            if (blockerRepo === repoName && blockedBy === number) throw new OpexToolError("Uma issue não pode bloquear a si mesma.")
            const id = await issueDbId(blockerRepo, blockedBy, context.signal)
            await withContext(`Issue ${repoName}#${number}`, () => githubRequest(`/repos/${repoName}/issues/${number}/dependencies/blocked_by`, { method: "POST", body: { issue_id: id }, signal: context.signal, label: "opex: adicionar dependência" })).catch(rejected("Dependência"))
            await auditRelation(context.actorId, repoName, AcaoAuditoria.CRIAR, { issue: number, bloqueadaPor: `${blockerRepo}#${blockedBy}` })
            return { ok: true, issue: `${repoName}#${number}`, blockedBy: `${blockerRepo}#${blockedBy}` }
        },
    }),
    defineTool({
        name: "remove_issue_dependency",
        group: "issues",
        label: "Remover dependência",
        risk: "destructive",
        description: "Remove do GitHub a relação \"bloqueada por\" entre duas issues.",
        input: relationInput,
        summarize: (input) => `Remover o bloqueio de ${input.repo}#${input.number} por ${input.blockedByRepo ?? input.repo}#${input.blockedBy}`,
        execute: async ({ repo: rawRepo, number, blockedBy, blockedByRepo }, context) => {
            const repoName = parseRepo(rawRepo)
            const blockerRepo = blockedByRepo ? parseRepo(blockedByRepo) : repoName
            const id = await issueDbId(blockerRepo, blockedBy, context.signal)
            await withContext(`Dependência de ${repoName}#${number}`, () => githubRequest(`/repos/${repoName}/issues/${number}/dependencies/blocked_by/${id}`, { method: "DELETE", signal: context.signal, label: "opex: remover dependência" }))
            await auditRelation(context.actorId, repoName, AcaoAuditoria.EXCLUIR, { issue: number, bloqueadaPor: `${blockerRepo}#${blockedBy}` })
            return { ok: true, issue: `${repoName}#${number}`, removedBlockedBy: `${blockerRepo}#${blockedBy}` }
        },
    }),
    defineTool({
        name: "add_sub_issue",
        group: "issues",
        label: "Adicionar sub-issue",
        risk: "write",
        confirmByDefault: true,
        description: "Coloca uma issue como sub-issue de um épico no GitHub (replaceParent=true troca o épico atual dela).",
        input: subIssueInput.extend({ replaceParent: z.boolean().optional() }),
        summarize: (input) => `Colocar ${input.subIssueRepo ?? input.repo}#${input.subIssue} como sub-issue de ${input.repo}#${input.parent}`,
        execute: async ({ repo: rawRepo, parent, subIssue, subIssueRepo, replaceParent }, context) => {
            const repoName = parseRepo(rawRepo)
            const childRepo = subIssueRepo ? parseRepo(subIssueRepo) : repoName
            const id = await issueDbId(childRepo, subIssue, context.signal)
            await withContext(`Épico ${repoName}#${parent}`, () =>
                githubRequest(`/repos/${repoName}/issues/${parent}/sub_issues`, { method: "POST", body: { sub_issue_id: id, ...(replaceParent ? { replace_parent: true } : {}) }, signal: context.signal, label: "opex: adicionar sub-issue" }),
            ).catch(rejected("Sub-issue"))
            await auditRelation(context.actorId, repoName, AcaoAuditoria.CRIAR, { epico: parent, subIssue: `${childRepo}#${subIssue}` })
            return { ok: true, parent: `${repoName}#${parent}`, subIssue: `${childRepo}#${subIssue}` }
        },
    }),
    defineTool({
        name: "remove_sub_issue",
        group: "issues",
        label: "Remover sub-issue",
        risk: "destructive",
        description: "Tira uma issue do épico no GitHub (a issue continua existindo).",
        input: subIssueInput,
        summarize: (input) => `Tirar ${input.subIssueRepo ?? input.repo}#${input.subIssue} do épico ${input.repo}#${input.parent}`,
        execute: async ({ repo: rawRepo, parent, subIssue, subIssueRepo }, context) => {
            const repoName = parseRepo(rawRepo)
            const childRepo = subIssueRepo ? parseRepo(subIssueRepo) : repoName
            const id = await issueDbId(childRepo, subIssue, context.signal)
            await withContext(`Épico ${repoName}#${parent}`, () => githubRequest(`/repos/${repoName}/issues/${parent}/sub_issue`, { method: "DELETE", body: { sub_issue_id: id }, signal: context.signal, label: "opex: remover sub-issue" }))
            await auditRelation(context.actorId, repoName, AcaoAuditoria.EXCLUIR, { epico: parent, subIssue: `${childRepo}#${subIssue}` })
            return { ok: true, parent: `${repoName}#${parent}`, removedSubIssue: `${childRepo}#${subIssue}` }
        },
    }),
]

export const issueTools = [...readTools, ...writeTools]
