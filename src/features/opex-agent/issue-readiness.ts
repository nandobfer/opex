import { TASK_PRIORITIES, type TaskPriority } from "@/features/tasks/constants"

/**
 * Prontidão de issues do GitHub (módulo puro): entrega de cada issue, veredito pelas dependências
 * formais ("bloqueada por"/"bloqueia"), quantas issues ela destrava e o ranking do que começar.
 */

export type IssueState = "open" | "closed"

export interface IssueRefLite {
    /** `dono/nome` em minúsculas. */
    repo: string
    number: number
    title: string
    state: IssueState
    /** `completed`, `not_planned`, `duplicate`, `reopened` ou `null`. */
    stateReason: string | null
    url: string
    assignees?: string[]
}

export interface IssuePr {
    number: number
    title: string
    url: string
    state: "open" | "closed" | "merged"
    mergedAt: string | null
    baseRef: string
    /** O PR declara que fecha a issue (`Closes #N` ou vínculo manual). */
    closes: boolean
}

export interface IssueNode extends IssueRefLite {
    assignees: string[]
    labels: string[]
    issueType: string | null
    milestone: string | null
    closedAt: string | null
    createdAt: string | null
    updatedAt: string | null
    parent: IssueRefLite | null
    subIssues: { total: number; completed: number }
    blockedBy: IssueRefLite[]
    blocking: IssueRefLite[]
    prs: IssuePr[]
}

/** Tarefa do Opex vinculada à issue. */
export interface LinkedTaskLite {
    id: string
    code: string
    /** Nome da coluna do quadro em que a tarefa está. */
    column: string
    /** Na coluna de conclusão do projeto (`closedColumnKey`). */
    concluded: boolean
    /** Com mesa de trabalho aberta e não concluída. */
    active: boolean
}

export const DELIVERY_STATES = ["done", "cancelled", "merged", "in_progress", "pending", "unknown"] as const
export type DeliveryState = (typeof DELIVERY_STATES)[number]

export interface Delivery {
    state: DeliveryState
    /** Por que (em pt-BR), para o modelo explicar ao usuário. */
    evidence: string
    pr?: { number: number; url: string; baseRef: string }
    task?: { code: string; column: string }
}

/** O que conta como entregue para liberar quem depende: código mesclado (padrão) ou tarefa concluída/issue fechada. */
export type DeliveredAt = "merged" | "done"

export const VERDICTS = ["ready", "partial", "unknown", "blocked", "delivered", "epic"] as const
export type Verdict = (typeof VERDICTS)[number]

export const issueKey = (repo: string, number: number) => `${repo.toLowerCase()}#${number}`

export function parseIssueKey(key: string): { repo: string; number: number } {
    const at = key.lastIndexOf("#")
    return { repo: key.slice(0, at), number: Number(key.slice(at + 1)) }
}

/** Referência curta para exibir: `#N` no mesmo repositório, `dono/nome#N` fora dele. */
export const issueLabel = (repo: string, number: number, baseRepo?: string) => (baseRepo && repo.toLowerCase() === baseRepo.toLowerCase() ? `#${number}` : `${repo}#${number}`)

/** Sem acento, minúsculas e só letras/números separados por espaço. */
export function normalizeTitle(value: string): string {
    return value
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
}

const MIN_TITLE_MATCH = 12

/** Força da ligação PR ↔ issue. Só menção (`#N` no corpo) não conta: PRs citam issues futuras. */
export function prMatchesIssue(pr: Pick<IssuePr, "title" | "closes">, issue: { title: string }, taskCode?: string | null): "closing" | "task_code" | "title" | null {
    if (pr.closes) return "closing"
    if (taskCode && pr.title.toLowerCase().includes(taskCode.toLowerCase())) return "task_code"
    const title = normalizeTitle(issue.title)
    if (title.length >= MIN_TITLE_MATCH && normalizeTitle(pr.title).includes(title)) return "title"
    return null
}

const MATCH_LABELS = { closing: "que fecha a issue", task_code: "com o código da tarefa no título", title: "com o título da issue" } as const

/**
 * Entrega da issue, nesta ordem: fechada (concluída/cancelada) → tarefa na coluna de conclusão do
 * projeto → PR mesclado numa branch de entrega → tarefa com mesa aberta ou PR aberto → pendente.
 * `branches` = branches que contam como entrega (base/destino da central e a padrão); `null` = qualquer.
 */
export function deliveryOf(issue: Pick<IssueRefLite, "state" | "stateReason" | "title"> & { prs?: IssuePr[] }, task: LinkedTaskLite | null, branches: ReadonlySet<string> | null): Delivery {
    const taskInfo = task ? { task: { code: task.code, column: task.column } } : {}
    if (issue.state === "closed") {
        if (issue.stateReason === "not_planned" || issue.stateReason === "duplicate") {
            return { state: "cancelled", evidence: issue.stateReason === "duplicate" ? "Issue fechada como duplicada" : "Issue fechada como não planejada", ...taskInfo }
        }
        return { state: "done", evidence: "Issue fechada como concluída", ...taskInfo }
    }
    if (task?.concluded) {
        return { state: "done", evidence: `Tarefa ${task.code} concluída (${task.column})`, ...taskInfo }
    }
    const strong = (issue.prs ?? [])
        .map((pr) => ({ pr, match: prMatchesIssue(pr, issue, task ? task.code : null) }))
        .filter((item): item is { pr: IssuePr; match: NonNullable<typeof item.match> } => item.match !== null)
    const merged = strong
        .filter(({ pr }) => pr.state === "merged" && (!branches || branches.has(pr.baseRef)))
        .sort((a, b) => (b.pr.mergedAt ?? "").localeCompare(a.pr.mergedAt ?? ""))[0]
    if (merged) {
        return {
            state: "merged",
            evidence: `PR #${merged.pr.number} mesclado em ${merged.pr.baseRef} (${MATCH_LABELS[merged.match]})${task ? `; tarefa ${task.code} ainda em ${task.column}` : ""}`,
            pr: { number: merged.pr.number, url: merged.pr.url, baseRef: merged.pr.baseRef },
            ...taskInfo,
        }
    }
    const open = strong.find(({ pr }) => pr.state === "open")
    if (task?.active) {
        return { state: "in_progress", evidence: `Tarefa ${task.code} com mesa de trabalho aberta${open ? ` (PR #${open.pr.number} aberto)` : ""}`, ...(open ? { pr: { number: open.pr.number, url: open.pr.url, baseRef: open.pr.baseRef } } : {}), ...taskInfo }
    }
    if (open) return { state: "in_progress", evidence: `PR #${open.pr.number} aberto para ${open.pr.baseRef}`, pr: { number: open.pr.number, url: open.pr.url, baseRef: open.pr.baseRef }, ...taskInfo }
    return { state: "pending", evidence: task ? `Tarefa ${task.code} em ${task.column}, sem PR mesclado` : "Issue aberta, sem PR mesclado nem tarefa em andamento", ...taskInfo }
}

/** A dependência já libera quem depende dela? Cancelada também libera (com aviso). */
export function isResolved(state: DeliveryState, deliveredAt: DeliveredAt): boolean {
    return state === "done" || state === "cancelled" || (deliveredAt === "merged" && state === "merged")
}

/**
 * Veredito da issue: já entregue, épico (tem sub-issues), pronta (todas as bloqueadoras
 * resolvidas), parcial (as restantes estão em andamento), desconhecida (bloqueadora sem dados) ou
 * bloqueada (alguma pendente).
 */
export function verdictOf(self: DeliveryState, isEpic: boolean, blockers: readonly DeliveryState[], deliveredAt: DeliveredAt): Verdict {
    if (isResolved(self, deliveredAt)) return "delivered"
    if (isEpic) return "epic"
    const open = blockers.filter((state) => !isResolved(state, deliveredAt))
    if (open.length === 0) return "ready"
    if (open.some((state) => state === "pending")) return "blocked"
    if (open.some((state) => state === "unknown")) return "unknown"
    return "partial"
}

/**
 * Issues não resolvidas que esta destrava, direta e indiretamente (segue "bloqueia" pelo grafo
 * carregado; para nas resolvidas e nas que não foram carregadas além do primeiro nível).
 */
export function unlocksOf(start: string, blockingOf: (key: string) => readonly string[], resolved: (key: string) => boolean): { direct: string[]; total: string[] } {
    const direct = blockingOf(start).filter((key) => !resolved(key))
    const seen = new Set<string>([start])
    const queue = [...direct]
    const total: string[] = []
    while (queue.length) {
        const key = queue.shift()!
        if (seen.has(key)) continue
        seen.add(key)
        total.push(key)
        for (const next of blockingOf(key)) if (!seen.has(next) && !resolved(next)) queue.push(next)
    }
    return { direct, total }
}

const STOP_WORDS = new Set(["feature", "bug", "improvements", "improvement", "rascunho", "epico", "de", "da", "do", "das", "dos", "e", "o", "a", "os", "as", "no", "na", "em", "para", "por", "com"])

const titleWords = (title: string) => new Set(normalizeTitle(title).split(" ").filter((word) => word.length > 2 && !STOP_WORDS.has(word)))

/** Semelhança de títulos (Jaccard das palavras relevantes), de 0 a 1. */
export function titleSimilarity(a: string, b: string): number {
    const left = titleWords(a)
    const right = titleWords(b)
    if (!left.size || !right.size) return 0
    let common = 0
    for (const word of left) if (right.has(word)) common++
    return common / (left.size + right.size - common)
}

export const SIMILAR_TITLE_MIN = 0.6

/** Pares com títulos parecidos (possíveis duplicadas). */
export function similarPairs<T extends { key: string; title: string }>(items: readonly T[], min = SIMILAR_TITLE_MIN): { a: T; b: T; score: number }[] {
    const pairs: { a: T; b: T; score: number }[] = []
    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
            const score = titleSimilarity(items[i]!.title, items[j]!.title)
            if (score >= min) pairs.push({ a: items[i]!, b: items[j]!, score: Math.round(score * 100) / 100 })
        }
    }
    return pairs.sort((x, y) => y.score - x.score)
}

export interface RankInput {
    key: string
    verdict: Verdict
    unlocksTotal: number
    unlocksDirect: number
    priority: TaskPriority
    estimateHours: number | null
    number: number
}

const priorityIndex = (priority: TaskPriority) => {
    const index = TASK_PRIORITIES.indexOf(priority)
    return index === -1 ? TASK_PRIORITIES.length : index
}

/** Ordem: veredito → quantas destrava (total, depois direto) → prioridade → menor estimativa → número da issue. */
export function compareRank(a: RankInput, b: RankInput): number {
    return (
        VERDICTS.indexOf(a.verdict) - VERDICTS.indexOf(b.verdict) ||
        b.unlocksTotal - a.unlocksTotal ||
        b.unlocksDirect - a.unlocksDirect ||
        priorityIndex(a.priority) - priorityIndex(b.priority) ||
        (a.estimateHours ?? Number.POSITIVE_INFINITY) - (b.estimateHours ?? Number.POSITIVE_INFINITY) ||
        a.number - b.number
    )
}
