import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { TASK_PRIORITIES, TASK_TYPES, type TaskPriority, type TaskType } from "@/features/tasks/constants"
import type { GithubPriorityRule, GithubTypeRule } from "./schemas"

/**
 * Regras puras da integração GitHub (cliente e servidor): leitura da issue, mapeamento para os
 * campos da tarefa do Go! Sipal, menção da issue numa tarefa, imagens do corpo e escolha do commit
 * que fechou a issue.
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

/** Repositório citado no `repositoryUrl` de um produto do Go! Sipal (GitHub). */
export function repoFromUrl(url: string | null | undefined): string | null {
    if (!url) return null
    const match = url.trim().match(/github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?(?:[/#?].*)?$/i)
    return match ? normalizeRepo(match[1]!) : null
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
    /** De onde veio (mostrado na tela do rascunho). */
    origin: string
}

/** Tipo: Issue Type tem precedência sobre label; sem regra, o padrão do vínculo. */
export function mapTaskType(issue: Pick<GithubIssueLite, "type" | "labels">, rules: readonly GithubTypeRule[], fallback: TaskType): Mapped<TaskType> {
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
    return { value: fallback, origin: "padrão do vínculo" }
}

export function mapPriority(issue: Pick<GithubIssueLite, "labels">, rules: readonly GithubPriorityRule[], fallback: TaskPriority): Mapped<TaskPriority> {
    const labels = new Map(issue.labels.map((label) => [normalizeText(label), label]))
    for (const rule of rules) {
        const label = labels.get(normalizeText(rule.label))
        if (label && TASK_PRIORITIES.includes(rule.priority)) return { value: rule.priority, origin: `label "${label}"` }
    }
    return { value: fallback, origin: "padrão do vínculo" }
}

export interface DeveloperRef {
    id: string
    name: string
    email: string | null
}

/** Responsável: primeiro assignee com pessoa mapeada (aba Pessoas); sem nenhum, sem responsável. */
export function mapAssignee(issue: Pick<GithubIssueLite, "assignees">, people: ReadonlyMap<string, DeveloperRef>): Mapped<DeveloperRef | null> {
    for (const login of issue.assignees) {
        const developer = people.get(login.toLowerCase())
        if (developer) return { value: developer, origin: `assignee @${login}` }
    }
    return { value: null, origin: issue.assignees.length ? "assignee sem pessoa mapeada" : "issue sem assignee" }
}

/** Pacote de trabalho do produto com o mesmo nome do milestone (sem caixa nem acento). */
export function mapWorkPackage<T extends { id: string; name: string }>(milestone: string | null, workPackages: readonly T[]): Mapped<T | null> {
    if (!milestone) return { value: null, origin: "issue sem milestone" }
    const found = workPackages.find((item) => normalizeText(item.name) === normalizeText(milestone))
    return found ? { value: found, origin: `milestone "${milestone}"` } : { value: null, origin: `milestone "${milestone}" sem pacote correspondente` }
}

/** Descrição da tarefa: corpo da issue + rodapé fixo com o link (também detecta o vínculo depois). */
export function buildTaskDescription(body: string, issue: { url: string; authorLogin: string; authorName: string | null; createdAt: string | Date | null }): string {
    const when = issue.createdAt ? ` em ${format(new Date(issue.createdAt), "dd/MM/yyyy", { locale: ptBR })}` : ""
    const who = issue.authorName ? `${issue.authorName} (@${issue.authorLogin})` : `@${issue.authorLogin}`
    const text = body.trim()
    return `${text ? `${text}\n\n` : ""}---\nIssue: ${issue.url}\nAberta por ${who}${when}`
}

// ---------------------------------------------------------------------------
// Menção da issue numa tarefa
// ---------------------------------------------------------------------------

/**
 * A tarefa cita a issue? URL da issue, `owner/repo#N` ou `#N` solto (o produto tem um único
 * repositório). `#999` não casa com `#9990` nem com âncoras de Markdown (`](#9-titulo)`,
 * `#9-titulo`), comuns em sumários de especificações.
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

// ---------------------------------------------------------------------------
// Imagens do corpo
// ---------------------------------------------------------------------------

export interface BodyImage {
    /** Trecho exato no corpo (`![alt](url)` ou `<img …>`). */
    match: string
    url: string
    alt: string
    position: number
}

const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g
const HTML_IMAGE = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi
const IMAGE_HOSTS = /^https:\/\/(github\.com\/user-attachments\/|(?:[\w-]+\.)?githubusercontent\.com\/)/i

/** Imagens hospedadas pelo GitHub, na ordem em que aparecem. */
export function extractIssueImages(body: string): BodyImage[] {
    const found: BodyImage[] = []
    for (const match of body.matchAll(MARKDOWN_IMAGE)) {
        if (IMAGE_HOSTS.test(match[2]!)) found.push({ match: match[0], url: match[2]!, alt: match[1] ?? "", position: match.index ?? 0 })
    }
    for (const match of body.matchAll(HTML_IMAGE)) {
        if (!IMAGE_HOSTS.test(match[1]!)) continue
        const alt = match[0].match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] ?? ""
        found.push({ match: match[0], url: match[1]!, alt, position: match.index ?? 0 })
    }
    return found.sort((a, b) => a.position - b.position)
}

/** `src` das imagens do `body_html` (URLs assinadas de anexos privados), na ordem. */
export function htmlImageSources(html: string | null | undefined): string[] {
    if (!html) return []
    return [...html.matchAll(HTML_IMAGE)].map((match) => match[1]!.replace(/&amp;/g, "&"))
}

/** Extensão para o nome do anexo a partir do tipo do arquivo. */
export function imageExtension(contentType: string): string {
    const subtype = contentType.split(";")[0]!.split("/")[1]?.toLowerCase() ?? "png"
    if (subtype === "jpeg") return "jpg"
    if (subtype === "svg+xml") return "svg"
    return /^[a-z0-9]+$/.test(subtype) ? subtype : "png"
}

/** Troca cada imagem anexada pela referência ao anexo; as que falharam ficam como estavam. */
export function replaceImagesWithAttachments(body: string, images: readonly BodyImage[], files: ReadonlyMap<number, string>): string {
    let result = body
    images.forEach((image, index) => {
        const file = files.get(index)
        if (file) result = result.replace(image.match, `📎 Imagem ${index + 1} (anexo ${file})`)
    })
    return result
}

/** Corpo para prévia: imagens trocadas pelas URLs assinadas do `body_html` (quando as quantidades batem). */
export function previewBody(body: string, signed: readonly string[]): string {
    const images = extractIssueImages(body)
    if (images.length === 0 || images.length !== signed.length) return body
    let result = body
    images.forEach((image, index) => {
        result = result.replace(image.match, `![${image.alt || `Imagem ${index + 1}`}](${signed[index]})`)
    })
    return result
}

// ---------------------------------------------------------------------------
// Commit que fechou a issue
// ---------------------------------------------------------------------------

export interface CommitPlan {
    commitSha: string | null
    commitRepo: string | null
    /** PR para buscar (merge ou último commit) e informar como `pullRequestUrl`. */
    pr: { repo: string; number: number; merged: boolean } | null
    source: string
}

function repoFromApiUrl(url: unknown): string | null {
    const match = typeof url === "string" ? url.match(/\/repos\/([\w.-]+\/[\w.-]+)\//) : null
    return match ? match[1]!.toLowerCase() : null
}

function crossReferencedPrs(events: readonly Raw[]): { repo: string; number: number; merged: boolean }[] {
    return events
        .filter((event) => event.event === "cross-referenced" && isObj(event.source) && isObj(event.source.issue))
        .map((event) => {
            const issue = (event.source as Raw).issue as Raw
            const pr = isObj(issue.pull_request) ? issue.pull_request : null
            const repo = isObj(issue.repository) ? str(issue.repository.full_name) : repoFromApiUrl(issue.url)
            return pr && repo && typeof issue.number === "number" ? { repo: repo.toLowerCase(), number: issue.number, merged: Boolean(str(pr.merged_at)) } : null
        })
        .filter((item): item is { repo: string; number: number; merged: boolean } => item !== null)
}

/**
 * Ordem de preferência, a partir da timeline da issue:
 * 1. commit que fechou a issue (evento `closed` com `commit_id`);
 * 2. PR mergeado que cita a issue (commit de merge);
 * 3. último commit que cita `#N` (evento `referenced`);
 * 4. último PR que cita a issue (último commit dele).
 */
export function planIssueCommit(timeline: readonly unknown[], repo: string): CommitPlan | null {
    const events = timeline.filter(isObj)
    const prs = crossReferencedPrs(events)
    const mergedPr = [...prs].reverse().find((pr) => pr.merged) ?? null
    const closed = [...events].reverse().find((event) => event.event === "closed" && str(event.commit_id))
    if (closed) {
        return { commitSha: str(closed.commit_id), commitRepo: repoFromApiUrl(closed.commit_url) ?? repo, pr: mergedPr, source: "commit que fechou a issue" }
    }
    if (mergedPr) return { commitSha: null, commitRepo: null, pr: mergedPr, source: `PR #${mergedPr.number} que fechou a issue` }
    const referenced = [...events].reverse().find((event) => event.event === "referenced" && str(event.commit_id))
    if (referenced) return { commitSha: str(referenced.commit_id), commitRepo: repoFromApiUrl(referenced.commit_url) ?? repo, pr: null, source: "commit que cita a issue" }
    const anyPr = prs.at(-1)
    if (anyPr) return { commitSha: null, commitRepo: null, pr: anyPr, source: `PR #${anyPr.number} que cita a issue` }
    return null
}
