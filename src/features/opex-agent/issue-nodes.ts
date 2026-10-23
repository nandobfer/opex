import { type IssueNode, type IssuePr, type IssueRefLite } from "./issue-readiness"

/** Conversão das respostas GraphQL do GitHub em `IssueNode` (módulo puro). */

export interface RawLite {
    number: number
    title: string
    url: string
    state: string
    stateReason?: string | null
    repository?: { nameWithOwner: string } | null
    assignees?: { nodes: { login: string }[] } | null
}

export interface RawPr {
    number?: number
    title?: string
    url?: string
    state?: string
    mergedAt?: string | null
    baseRefName?: string
    repository?: { nameWithOwner: string } | null
}

export interface RawNode extends RawLite {
    closedAt: string | null
    createdAt: string | null
    updatedAt: string | null
    labels: { nodes: { name: string }[] }
    issueType: { name: string } | null
    milestone: { title: string } | null
    parent: RawLite | null
    subIssuesSummary: { total: number; completed: number } | null
    blockedBy: { nodes: RawLite[] }
    blocking: { nodes: RawLite[] }
    closedByPullRequestsReferences: { nodes: RawPr[] }
    timelineItems: { nodes: ({ source?: RawPr; subject?: RawPr } | null)[] }
}

export type RawRepo = { defaultBranchRef: { name: string } | null } & Record<string, RawNode | null | { name: string }>

const lower = (value: string) => value.toLowerCase()

function toLite(raw: RawLite, fallbackRepo: string): IssueRefLite {
    return {
        repo: lower(raw.repository?.nameWithOwner ?? fallbackRepo),
        number: raw.number,
        title: raw.title,
        state: lower(raw.state) === "closed" ? "closed" : "open",
        stateReason: raw.stateReason ? lower(raw.stateReason) : null,
        url: raw.url,
        ...(raw.assignees ? { assignees: raw.assignees.nodes.map((item) => item.login) } : {}),
    }
}

function toPr(raw: RawPr, closes: boolean): IssuePr | null {
    if (!raw.number || !raw.url) return null
    const state = lower(raw.state ?? "")
    return {
        number: raw.number,
        title: raw.title ?? "",
        url: raw.url,
        state: state === "merged" || raw.mergedAt ? "merged" : state === "open" ? "open" : "closed",
        mergedAt: raw.mergedAt ?? null,
        baseRef: raw.baseRefName ?? "",
        closes,
    }
}

/** PRs ligados à issue: os que a fecham e os do mesmo repositório que a citam (sem repetir). */
export function prsOf(raw: Pick<RawNode, "closedByPullRequestsReferences" | "timelineItems">, repo: string): IssuePr[] {
    const byNumber = new Map<number, IssuePr>()
    for (const item of raw.closedByPullRequestsReferences?.nodes ?? []) {
        const pr = toPr(item, true)
        if (pr) byNumber.set(pr.number, pr)
    }
    for (const node of raw.timelineItems?.nodes ?? []) {
        const source = node?.source ?? node?.subject
        if (!source?.number || lower(source.repository?.nameWithOwner ?? repo) !== repo) continue
        const pr = toPr(source, Boolean(node?.subject))
        if (pr && !byNumber.has(pr.number)) byNumber.set(pr.number, pr)
    }
    return [...byNumber.values()]
}

export function toIssueNode(raw: RawNode, repo: string): IssueNode {
    const lite = toLite(raw, repo)
    return {
        ...lite,
        assignees: raw.assignees?.nodes.map((item) => item.login) ?? [],
        labels: raw.labels?.nodes.map((item) => item.name) ?? [],
        issueType: raw.issueType?.name ?? null,
        milestone: raw.milestone?.title ?? null,
        closedAt: raw.closedAt,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        parent: raw.parent ? toLite(raw.parent, repo) : null,
        subIssues: { total: raw.subIssuesSummary?.total ?? 0, completed: raw.subIssuesSummary?.completed ?? 0 },
        blockedBy: raw.blockedBy?.nodes.map((item) => toLite(item, repo)) ?? [],
        blocking: raw.blocking?.nodes.map((item) => toLite(item, repo)) ?? [],
        prs: prsOf(raw, lite.repo),
    }
}
