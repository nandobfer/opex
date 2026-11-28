/**
 * Saída do GitHub Actions no log do build da prévia (aba "Build (N)", OPE-214). Módulo puro: o servidor
 * acompanha o run pela API e escreve aqui o que o workflow faz — etapas ao vivo, o log de cada job e,
 * na falha, o trecho que a explica — no lugar do silêncio do script enquanto espera o run.
 */

export interface GithubRunRef {
    repo: string
    runId: number
}

const RUN_URL = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/actions\/runs\/(\d+)/g

/** Último run do GitHub Actions citado no trecho (o script imprime `Prévia GitHub: <url>`). */
export function parseGithubRunUrl(text: string): GithubRunRef | null {
    let found: GithubRunRef | null = null
    for (const match of text.matchAll(RUN_URL)) found = { repo: match[1]!, runId: Number(match[2]) }
    return found
}

export interface GithubStep {
    name: string
    number: number
    status: string
    conclusion: string | null
    started_at?: string | null
    completed_at?: string | null
}

export interface GithubJob {
    id: number
    name: string
    status: string
    conclusion: string | null
    started_at?: string | null
    completed_at?: string | null
    steps?: GithubStep[]
}

/** O que já foi escrito de cada job (cabeçalho e etapas iniciadas/concluídas). */
export interface StepsSeen {
    jobs: Set<number>
    started: Set<string>
    finished: Set<string>
}

export const emptyStepsSeen = (): StepsSeen => ({ jobs: new Set(), started: new Set(), finished: new Set() })

function seconds(from?: string | null, to?: string | null): number | null {
    if (!from || !to) return null
    const ms = Date.parse(to) - Date.parse(from)
    return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 1000) : null
}

function duration(total: number | null): string {
    if (total === null) return ""
    if (total < 60) return ` ${total} s`
    return ` ${Math.floor(total / 60)} min ${String(total % 60).padStart(2, "0")} s`
}

export function githubQueuedLine(): string {
    return "\x1b[90m⏳ GitHub Actions: aguardando um runner…\x1b[0m\n"
}

export function githubJobHeader(job: Pick<GithubJob, "name">): string {
    return `\n\x1b[1;36m● Job ${job.name}\x1b[0m\n`
}

export function githubStepStart(step: Pick<GithubStep, "name" | "number">, total: number): string {
    return `\x1b[1m▶ Etapa ${step.number}/${total} · ${step.name}\x1b[0m\n`
}

export function githubStepEnd(step: GithubStep): string {
    const time = duration(seconds(step.started_at, step.completed_at))
    if (step.conclusion === "success") return `  \x1b[32m✔ ${step.name}${time}\x1b[0m\n`
    if (step.conclusion === "skipped") return `  \x1b[90m⊘ ${step.name} (pulada)\x1b[0m\n`
    if (step.conclusion === "cancelled") return `  \x1b[33m⊘ ${step.name} (cancelada)${time}\x1b[0m\n`
    return `  \x1b[31m✖ ${step.name} falhou${time}\x1b[0m\n`
}

/** Fim de um job (antes do log dele). */
export function githubJobEnd(job: GithubJob): string {
    const time = duration(seconds(job.started_at, job.completed_at))
    if (job.conclusion === "success") return `\x1b[32m✔ Job ${job.name} concluído${time}\x1b[0m\n`
    if (job.conclusion === "skipped") return `\x1b[90m⊘ Job ${job.name} pulado\x1b[0m\n`
    return `\x1b[31m✖ Job ${job.name}: ${job.conclusion ?? "sem conclusão"}${time}\x1b[0m\n`
}

/**
 * Evento das etapas na ordem em que acontecem: `text` (cabeçalho do job ou início de etapa, escrito como
 * está) ou `done` (etapa terminou: o log dela entra antes da linha de fim, `githubStepEnd`).
 */
export type StepEvent = { kind: "text"; jobId: number; text: string } | { kind: "done"; jobId: number; step: GithubStep }

/**
 * Transições das etapas desde a última consulta — cabeçalho do job, início e fim de cada etapa, cada um
 * uma única vez e na ordem do job (inclusive as puladas, que não têm log). Muta `seen`.
 */
export function diffSteps(seen: StepsSeen, jobs: GithubJob[]): StepEvent[] {
    const events: StepEvent[] = []
    for (const job of jobs) {
        if (job.status === "queued" || job.status === "waiting" || job.status === "pending") continue
        if (!seen.jobs.has(job.id)) {
            seen.jobs.add(job.id)
            events.push({ kind: "text", jobId: job.id, text: githubJobHeader(job) })
        }
        const steps = [...(job.steps ?? [])].sort((a, b) => a.number - b.number)
        for (const step of steps) {
            const key = `${job.id}:${step.number}`
            const done = step.status === "completed"
            const skipped = done && step.conclusion === "skipped"
            if (!seen.started.has(key) && (step.status === "in_progress" || (done && !skipped))) {
                seen.started.add(key)
                events.push({ kind: "text", jobId: job.id, text: githubStepStart(step, steps.length) })
            }
            if (done && !seen.finished.has(key)) {
                seen.finished.add(key)
                seen.started.add(key)
                events.push({ kind: "done", jobId: job.id, step })
            }
        }
    }
    return events
}

const TIMESTAMP = /^\uFEFF?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z ?/

/** Uma linha do log cru do job, sem o carimbo de hora, com os comandos do runner em cores. `null` = some. */
function formatLine(raw: string): string | null {
    const line = raw.replace(TIMESTAMP, "")
    if (line.startsWith("##[endgroup]")) return null
    if (line.startsWith("##[group]")) return `\x1b[1m▸ ${line.slice(9)}\x1b[0m`
    if (line.startsWith("##[error]")) return `\x1b[31m${line.slice(9)}\x1b[0m`
    if (line.startsWith("##[warning]")) return `\x1b[33m${line.slice(11)}\x1b[0m`
    if (line.startsWith("##[notice]")) return `\x1b[36m${line.slice(10)}\x1b[0m`
    if (line.startsWith("##[debug]")) return `\x1b[90m${line.slice(9)}\x1b[0m`
    if (line.startsWith("[command]")) return `\x1b[90m${line.slice(9)}\x1b[0m`
    return line
}

/** Trecho do log cru de um job (linhas completas) formatado para o terminal. */
export function formatJobLog(raw: string): string {
    const lines = raw.replace(/\r\n?/g, "\n").split("\n")
    if (lines.at(-1) === "") lines.pop()
    const out = lines.map(formatLine).filter((line): line is string => line !== null)
    return out.length ? `${out.join("\n")}\n` : ""
}

const EXCERPT_LINES = 80
const EXCERPT_CHARS = 8_000
const ERROR_LINES = 20

function plainLines(raw: string): string[] {
    return raw
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => line.replace(TIMESTAMP, ""))
        .filter((line) => !line.startsWith("##[endgroup]"))
}

/**
 * Trecho que explica a falha do run, em texto puro (vai para a aba e para o agente de correção): o job
 * e a etapa que falharam, as linhas `##[error]` e o final do log do job. `null` = nenhum job falhou.
 */
export function failureExcerpt(jobs: GithubJob[], logs: ReadonlyMap<number, string>): string | null {
    const failed = jobs.filter((job) => job.status === "completed" && job.conclusion !== "success" && job.conclusion !== "skipped")
    if (!failed.length) return null
    const parts = failed.map((job) => {
        const step = job.steps?.find((s) => s.conclusion === "failure") ?? job.steps?.find((s) => s.conclusion === "cancelled" || s.conclusion === "timed_out")
        const head = `Job "${job.name}" (${job.conclusion ?? "sem conclusão"})${step ? `, etapa ${step.number} "${step.name}"` : ""}`
        const raw = logs.get(job.id)
        if (!raw) return `${head}\n(log do job indisponível)`
        const lines = plainLines(raw)
        const errors = lines.filter((line) => line.startsWith("##[error]")).slice(-ERROR_LINES).map((line) => line.slice(9))
        const tail = lines.slice(-EXCERPT_LINES).join("\n").trim()
        return [head, errors.length ? `Erros:\n${errors.join("\n")}` : "", `Final do log:\n${tail}`].filter(Boolean).join("\n\n")
    })
    const text = parts.join("\n\n---\n\n")
    return text.length > EXCERPT_CHARS ? text.slice(-EXCERPT_CHARS) : text
}

/** Resumo da falha no terminal (o log completo já está acima). */
export function githubFailureBlock(excerpt: string): string {
    return `\n\x1b[1;31m✖ GitHub Actions falhou\x1b[0m\n\x1b[31m${excerpt}\x1b[0m\n`
}

export function githubRunDoneLine(conclusion: string | null): string {
    if (conclusion === "success") return "\n\x1b[32m✔ GitHub Actions concluído\x1b[0m\n"
    return `\n\x1b[31m✖ GitHub Actions terminou: ${conclusion ?? "sem conclusão"}\x1b[0m\n`
}

/** Aviso amarelo no log quando o acompanhamento do run não é possível (o build segue). */
export function githubFollowWarning(reason: string): string {
    return `\n\x1b[33m⚠ Não foi possível acompanhar o GitHub Actions pela integração GitHub: ${reason}. A saída do workflow não aparece aqui; o link da execução continua acima. Confira o token em Integrações › GitHub (leitura em Actions).\x1b[0m\n`
}
