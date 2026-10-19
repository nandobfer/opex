import type { AgenticCi } from "./schemas"

/**
 * Regras puras da correção de CI do PR (OPE-81): resultado das verificações do GitHub no commit
 * atual, a decisão de acionar o agente e o texto do passo "CI" na verificação do PR.
 */

/** Item de `GET /repos/{repo}/commits/{sha}/check-runs`. */
export interface GithubCheckRun {
    id: number
    name: string
    status: string
    conclusion: string | null
    html_url?: string | null
    details_url?: string | null
    output?: { title?: string | null; summary?: string | null } | null
}

/** Item de `GET /repos/{repo}/commits/{sha}/status` (status de commit, API antiga). */
export interface GithubCommitStatus {
    id: number
    context: string
    state: string
    target_url?: string | null
    description?: string | null
}

export interface CiFailure {
    /** `check:<id>` ou `status:<id>` (muda quando a verificação é reexecutada). */
    id: string
    name: string
    url: string | null
    /** Run e job do GitHub Actions, quando a verificação vem dele. */
    runId: number | null
    jobId: number | null
    summary: string | null
}

/** `none`: sem verificações; `pending`: alguma ainda rodando (espera todas terminarem). */
export type CiState = "none" | "pending" | "passed" | "failed"

export interface CiResult {
    state: CiState
    failures: CiFailure[]
    /** Verificações consideradas (a última execução de cada check + os status de commit). */
    total: number
    /** Verificações ainda em andamento. */
    pending: number
}

/** Conclusões que contam como falha (`cancelled`, `skipped` e `neutral` não contam). */
export const CI_FAILED_CONCLUSIONS = ["failure", "timed_out", "startup_failure", "action_required"] as const

/** Estados de merge em que vale consultar as verificações (com falha, o GitHub informa um deles). */
export const CI_CHECK_MERGE_STATES = ["unstable", "blocked"] as const

const SUMMARY_MAX = 500

function actionsIds(url: string | null | undefined): { runId: number | null; jobId: number | null } {
    const match = url ? /\/actions\/runs\/(\d+)(?:\/job\/(\d+))?/.exec(url) : null
    return { runId: match ? Number(match[1]) : null, jobId: match?.[2] ? Number(match[2]) : null }
}

function clip(text: string): string | null {
    const value = text.trim()
    if (!value) return null
    return value.length > SUMMARY_MAX ? `${value.slice(0, SUMMARY_MAX)}…` : value
}

/** Última execução de cada verificação (uma reexecução cria outra com o mesmo nome e id maior). */
function latestByName(runs: GithubCheckRun[]): GithubCheckRun[] {
    const latest = new Map<string, GithubCheckRun>()
    for (const run of runs) {
        const current = latest.get(run.name)
        if (!current || run.id > current.id) latest.set(run.name, run)
    }
    return [...latest.values()]
}

/** Estado do CI no commit: espera todas as verificações terminarem antes de apontar falhas. */
export function ciFailureState(checkRuns: GithubCheckRun[], statuses: GithubCommitStatus[] = []): CiResult {
    const runs = latestByName(checkRuns)
    const total = runs.length + statuses.length
    if (!total) return { state: "none", failures: [], total: 0, pending: 0 }
    const pending = runs.filter((run) => run.status !== "completed").length + statuses.filter((status) => status.state === "pending").length
    if (pending) return { state: "pending", failures: [], total, pending }
    const failures: CiFailure[] = [
        ...runs
            .filter((run) => (CI_FAILED_CONCLUSIONS as readonly string[]).includes(run.conclusion ?? ""))
            .map((run) => ({
                id: `check:${run.id}`,
                name: run.name,
                url: run.html_url ?? run.details_url ?? null,
                ...actionsIds(run.details_url ?? run.html_url),
                summary: clip([run.output?.title, run.output?.summary].filter(Boolean).join("\n")),
            })),
        ...statuses
            .filter((status) => status.state === "failure" || status.state === "error")
            .map((status) => ({ id: `status:${status.id}`, name: status.context, url: status.target_url ?? null, ...actionsIds(status.target_url), summary: clip(status.description ?? "") })),
    ]
    return { state: failures.length ? "failed" : "passed", failures, total, pending: 0 }
}

/** Chave das falhas tratadas: o mesmo conjunto (commit + verificações) não é tratado duas vezes. */
export function ciFixKey(headSha: string, failures: CiFailure[]): string {
    return `${headSha}:${failures
        .map((failure) => failure.id)
        .sort()
        .join(",")}`
}

export interface CiFixState {
    ciFixHeadSha?: string | null
    ciFixKey?: string | null
    ciFixAttempts?: number
    ciFixLimitNotified?: boolean
}

export type CiFixDecision = { action: "skip"; reason: "disabled" | "handled" } | { action: "limit"; notify: boolean } | { action: "fix"; key: string; rerunAllowed: boolean; attempt: number }

/**
 * O que fazer com o CI falho do PR: corrigir (reexecução só na 1ª tentativa do commit), avisar do
 * limite (uma vez por sequência) ou nada (desligado na central ou falhas já tratadas).
 */
export function ciFixDecision(pr: CiFixState, ci: AgenticCi, headSha: string, failures: CiFailure[]): CiFixDecision {
    if (!ci.fixCi || !failures.length) return { action: "skip", reason: "disabled" }
    const key = ciFixKey(headSha, failures)
    if ((pr.ciFixKey ?? null) === key) return { action: "skip", reason: "handled" }
    const attempts = pr.ciFixAttempts ?? 0
    if (ci.ciFixLimit !== null && attempts >= ci.ciFixLimit) return { action: "limit", notify: !pr.ciFixLimitNotified }
    return { action: "fix", key, rerunAllowed: (pr.ciFixHeadSha ?? null) !== headSha, attempt: attempts + 1 }
}

/** Estado do CI em texto para o passo da verificação do PR. */
export function describeCiState(result: CiResult, headSha?: string | null): { text: string; level: "info" | "success" | "warn" } {
    const at = headSha ? ` no commit ${headSha.slice(0, 7)}` : ""
    switch (result.state) {
        case "none":
            return { text: `CI: nenhuma verificação${at}`, level: "info" }
        case "pending":
            return { text: `CI: ${result.pending} de ${result.total} verificação(ões) em andamento${at} — aguardando todas terminarem`, level: "info" }
        case "passed":
            return { text: `CI: ${result.total} verificação(ões) concluída(s) sem falha${at}`, level: "success" }
        case "failed":
            return { text: `CI falhou${at}: ${result.failures.map((failure) => failure.name).join(", ")}`, level: "warn" }
    }
}
