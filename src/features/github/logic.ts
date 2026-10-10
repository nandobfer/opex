import { TASK_PRIORITIES, TASK_TYPES, type TaskPriority, type TaskType } from "@/features/tasks/constants"
import type { GithubPriorityRule, GithubTypeRule } from "./schemas"

/**
 * Regras puras da integração GitHub (cliente e servidor): leitura da issue, mapeamento para os
 * campos da tarefa dO Opex e menção da issue numa tarefa.
 */

type Raw = Record<string, unknown>
const isObj = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value)
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null)

export const normalizeText = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// ---------------------------------------------------------------------------
// Issue
// ---------------------------------------------------------------------------

export interface GithubIssueLite {
    number: number
    title: string
    body: string
    htmlUrl: string
    state: "open" | "closed"
    stateReason: string | null
    labels: string[]
    type: string | null
    milestone: string | null
    assignees: string[]
    author: { login: string; avatarUrl: string | null }
    createdAt: string | null
    updatedAt: string | null
    isPullRequest: boolean
}

/** Issue da API REST (`/repos/{repo}/issues`). `null` se não tiver o mínimo. */
export function toIssueLite(raw: unknown): GithubIssueLite | null {
    if (!isObj(raw) || typeof raw.number !== "number") return null
    const user = isObj(raw.user) ? raw.user : {}
    const login = str(user.login)
    const htmlUrl = str(raw.html_url)
    if (!login || !htmlUrl) return null
    const labels = (Array.isArray(raw.labels) ? raw.labels : [])
        .map((label) => (typeof label === "string" ? label : isObj(label) ? str(label.name) : null))
        .filter((label): label is string => Boolean(label))
    const assignees = (Array.isArray(raw.assignees) ? raw.assignees : [])
        .map((person) => (isObj(person) ? str(person.login) : null))
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase())
    return {
        number: raw.number,
        title: str(raw.title) ?? `Issue #${raw.number}`,
        body: typeof raw.body === "string" ? raw.body : "",
        htmlUrl,
        state: raw.state === "closed" ? "closed" : "open",
        stateReason: str(raw.state_reason),
        labels,
        type: isObj(raw.type) ? str(raw.type.name) : null,
        milestone: isObj(raw.milestone) ? str(raw.milestone.title) : null,
        assignees,
        author: { login: login.toLowerCase(), avatarUrl: str(user.avatar_url) },
        createdAt: str(raw.created_at),
        updatedAt: str(raw.updated_at),
        isPullRequest: isObj(raw.pull_request),
    }
}

/** `owner/repo` normalizado (minúsculas, sem `.git`/barras). `null` se inválido. */
export function normalizeRepo(value: string): string | null {
    const cleaned = value
        .trim()
        .replace(/^https?:\/\/[^/]+\//i, "")
        .replace(/\.git$/i, "")
        .replace(/^\/+|\/+$/g, "")
        .toLowerCase()
    return /^[\w.-]+\/[\w.-]+$/.test(cleaned) ? cleaned : null
}

/** Nome do projeto a partir do repositório (parte depois de `/`). */
export function projectNameFromRepo(repo: string): string {
    return repo.split("/").pop() ?? repo
}

/** Sigla do projeto a partir do repositório (ex.: `sap-painel-lancamento` → `SPL`). */
export function siglaFromRepo(repo: string): string {
    const name = projectNameFromRepo(repo)
    const parts = name.split(/[-_.\s]+/).filter(Boolean)
    if (parts.length > 1) return parts.map((part) => part[0]!).join("").toUpperCase().slice(0, 4)
    return name.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 3) || "PRJ"
}

/** URL da interface web a partir da URL da API (`api.github.com` → `github.com`; GHES → sem `/api/v3`). */
export function htmlBaseOf(apiUrl: string): string {
    const trimmed = apiUrl.replace(/\/+$/, "")
    if (/^https?:\/\/api\.github\.com$/i.test(trimmed)) return "https://github.com"
    return trimmed.replace(/\/api\/v3$/i, "")
}

// ---------------------------------------------------------------------------
// Mapeamento
// ---------------------------------------------------------------------------

export const DEFAULT_TYPE_RULES: GithubTypeRule[] = [
    { kind: "type", value: "Bug", taskType: "bugfix" },
    { kind: "type", value: "Feature", taskType: "feature" },
    { kind: "type", value: "Task", taskType: "analysis" },
    { kind: "label", value: "bug", taskType: "bugfix" },
    { kind: "label", value: "enhancement", taskType: "feature" },
    { kind: "label", value: "feature", taskType: "feature" },
    { kind: "label", value: "documentation", taskType: "analysis" },
    { kind: "label", value: "analysis", taskType: "analysis" },
    { kind: "label", value: "test", taskType: "testing" },
    { kind: "label", value: "testing", taskType: "testing" },
    { kind: "label", value: "ci", taskType: "devops" },
    { kind: "label", value: "devops", taskType: "devops" },
    { kind: "label", value: "infra", taskType: "devops" },
    { kind: "label", value: "automation", taskType: "automation" },
]

export const DEFAULT_PRIORITY_RULES: GithubPriorityRule[] = [
    { label: "urgent", priority: "urgent" },
    { label: "P0", priority: "urgent" },
    { label: "priority: critical", priority: "urgent" },
    { label: "P1", priority: "high" },
    { label: "priority: high", priority: "high" },
    { label: "P2", priority: "medium" },
    { label: "priority: medium", priority: "medium" },
    { label: "P3", priority: "low" },
    { label: "priority: low", priority: "low" },
]

export interface Mapped<T> {
    value: T
    /** De onde veio. */
    origin: string
}

/** Tipo: Issue Type tem precedência sobre label; sem regra, sem tipo. */
export function mapTaskType(issue: Pick<GithubIssueLite, "type" | "labels">, rules: readonly GithubTypeRule[], fallback: TaskType | null = null): Mapped<TaskType | null> {
    if (issue.type) {
        const rule = rules.find((item) => item.kind === "type" && normalizeText(item.value) === normalizeText(issue.type!))
        if (rule && TASK_TYPES.includes(rule.taskType)) return { value: rule.taskType, origin: `Issue Type "${issue.type}"` }
    }
    const labels = new Map(issue.labels.map((label) => [normalizeText(label), label]))
    for (const rule of rules) {
        if (rule.kind !== "label") continue
        const label = labels.get(normalizeText(rule.value))
        if (label && TASK_TYPES.includes(rule.taskType)) return { value: rule.taskType, origin: `label "${label}"` }
    }
    return { value: fallback, origin: "sem correspondência" }
}

export function mapPriority(issue: Pick<GithubIssueLite, "labels">, rules: readonly GithubPriorityRule[], fallback: TaskPriority = "medium"): Mapped<TaskPriority> {
    const labels = new Map(issue.labels.map((label) => [normalizeText(label), label]))
    for (const rule of rules) {
        const label = labels.get(normalizeText(rule.label))
        if (label && TASK_PRIORITIES.includes(rule.priority)) return { value: rule.priority, origin: `label "${label}"` }
    }
    return { value: fallback, origin: "padrão" }
}

/**
 * Descrição da tarefa a partir do corpo da issue: **verbatim** (sem rodapé). O vínculo bidirecional
 * exige que os dois lados tenham o mesmo texto — a proveniência fica no botão "Abrir issue".
 */
export function taskDescriptionFromIssue(body: string | null | undefined): string {
    return (body ?? "").trim()
}

// ---------------------------------------------------------------------------
// Mapeamento reverso (tarefa → issue)
// ---------------------------------------------------------------------------

/** Labels a enviar à issue: a prioridade e o tipo viram labels pelas regras do mapeamento. */
export function reverseLabels(
    type: TaskType | null,
    priority: TaskPriority | null,
    mapping: { typeRules: readonly GithubTypeRule[]; priorityRules: readonly GithubPriorityRule[] },
): string[] {
    const labels = new Set<string>()
    if (type) {
        const rule = mapping.typeRules.find((item) => item.kind === "label" && item.taskType === type)
        if (rule) labels.add(rule.value)
    }
    if (priority) {
        const rule = mapping.priorityRules.find((item) => item.priority === priority)
        if (rule) labels.add(rule.label)
    }
    return [...labels]
}

/** Estado da issue conforme a coluna da tarefa (só quando há coluna de conclusão configurada). */
export function issueStateForColumn(columnKey: string, closedColumnKey: string | null): "open" | "closed" {
    return closedColumnKey && columnKey === closedColumnKey ? "closed" : "open"
}

/**
 * Coluna que a tarefa deve assumir conforme o estado da issue (`null` = sem mudança). Fechar leva à
 * coluna de conclusão; reabrir tira da coluna de conclusão e volta à coluna de entrada.
 */
export function columnForIssueState(
    state: "open" | "closed",
    closedColumnKey: string | null,
    entryColumnKey: string,
    currentColumnKey: string,
): string | null {
    if (!closedColumnKey) return null
    if (state === "closed") return currentColumnKey === closedColumnKey ? null : closedColumnKey
    return currentColumnKey === closedColumnKey ? entryColumnKey : null
}

// ---------------------------------------------------------------------------
// Menção da issue numa tarefa
// ---------------------------------------------------------------------------

/**
 * A tarefa cita a issue? URL da issue, `owner/repo#N` ou `#N` solto (o projeto tem um único
 * repositório). `#999` não casa com `#9990` nem com âncoras de Markdown (`](#9-titulo)`, `#9-titulo`).
 */
export function mentionsIssue(text: string | null | undefined, repo: string, number: number): boolean {
    if (!text) return false
    const name = escapeRegex(repo)
    const patterns = [
        new RegExp(`github\\.com/${name}/issues/${number}(?!\\d)`, "i"),
        new RegExp(`${name}#${number}(?!\\d)`, "i"),
        new RegExp(`(?:^|[^\\w/&.#-])(?<!\\]\\()#${number}(?![\\w-])`),
    ]
    return patterns.some((pattern) => pattern.test(text))
}
