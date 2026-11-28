import { GithubError, githubRequestFull, githubRequestText, type GithubResponse } from "@/features/github/client"
import { logger } from "@/lib/logger"
import {
    completeLines,
    diffSteps,
    emptyStepsSeen,
    failureExcerpt,
    formatJobLog,
    githubFailureBlock,
    githubFollowWarning,
    githubJobEnd,
    githubQueuedLine,
    githubRunDoneLine,
    parseGithubRunUrl,
    type GithubJob,
} from "../github-run-log"

/**
 * Acompanhamento do run do GitHub Actions da prévia remota (OPE-214), pela integração GitHub: enquanto o
 * script da prévia espera o run em silêncio, o servidor escreve no log do build as etapas ao vivo, o log
 * de cada job e, na falha, o trecho que a explica. É melhor esforço: qualquer falha vira uma linha de
 * aviso no próprio log e o build segue pelo código de saída do script.
 */

/** Intervalo entre as consultas do run e dos jobs (com ETag: o 304 não gasta o limite de uso). */
export const FOLLOW_POLL_MS = 5_000
/** Enquanto o job roda, o log dele é lido a cada N consultas (se a API já o entregar). */
const LOG_EVERY_TICKS = 3
/** Consultas sem o log de um job já concluído antes de desistir dele (o log pode demorar a sair). */
const LOG_MISSES = 6
/** Falhas transitórias seguidas (rede, 5xx) antes de desistir do acompanhamento. */
const MAX_ERRORS = 4
/** Teto da espera pelo fim do acompanhamento depois que o script terminou. */
export const FINISH_TIMEOUT_MS = 60_000

export interface FollowResult {
    /** `false` = o acompanhamento não foi até o fim (erro ou interrupção). */
    followed: boolean
    conclusion: string | null
    /** Trecho que explica a falha do run (texto puro) ou `null`. */
    failure: string | null
}

interface RunInfo {
    status: string
    conclusion: string | null
}

const NOT_FOLLOWED: FollowResult = { followed: false, conclusion: null, failure: null }

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        if (signal.aborted) return resolve()
        const timer = setTimeout(done, ms)
        timer.unref?.()
        function done() {
            clearTimeout(timer)
            signal.removeEventListener("abort", done)
            resolve()
        }
        signal.addEventListener("abort", done, { once: true })
    })
}

function reasonOf(error: unknown): string {
    return error instanceof GithubError ? error.message : "erro inesperado ao consultar o GitHub"
}

export async function followGithubRun(input: { repo: string; runId: number; signal: AbortSignal; write: (text: string) => void; pollMs?: number }): Promise<FollowResult> {
    const { repo, runId, signal } = input
    const write = (text: string) => {
        if (text) input.write(text)
    }
    const pollMs = input.pollMs ?? FOLLOW_POLL_MS
    const base = `/repos/${repo}/actions/runs/${runId}`
    const seen = emptyStepsSeen()
    const logs = new Map<number, string>()
    const written = new Map<number, number>()
    const finalized = new Set<number>()
    const misses = new Map<number, number>()
    let jobs: GithubJob[] = []
    let run: RunInfo | null = null
    let runEtag: string | null = null
    let jobsEtag: string | null = null
    let queuedShown = false
    let errors = 0
    let tick = 0

    const readLog = async (jobId: number): Promise<string | null> => {
        try {
            return await githubRequestText(`/repos/${repo}/actions/jobs/${jobId}/logs`, { signal, label: "log do job do Actions" })
        } catch {
            return null
        }
    }

    for (;; tick++) {
        if (signal.aborted) return NOT_FOLLOWED
        try {
            const runRes: GithubResponse<RunInfo> = await githubRequestFull<RunInfo>(base, { etag: runEtag, signal, label: "run do Actions" })
            if (!runRes.notModified && runRes.data) {
                run = runRes.data
                runEtag = runRes.etag
            }
            const jobsRes: GithubResponse<{ jobs?: GithubJob[] }> = await githubRequestFull<{ jobs?: GithubJob[] }>(`${base}/jobs?per_page=100&filter=latest`, { etag: jobsEtag, signal, label: "jobs do Actions" })
            if (!jobsRes.notModified) {
                jobs = jobsRes.data?.jobs ?? []
                jobsEtag = jobsRes.etag
            }
            errors = 0
        } catch (error) {
            if (signal.aborted) return NOT_FOLLOWED
            const transient = !(error instanceof GithubError) || error.code === "UNAVAILABLE"
            if (transient && ++errors < MAX_ERRORS) {
                await sleep(pollMs, signal)
                continue
            }
            logger.warn({ repo, runId, code: error instanceof GithubError ? error.code : "UNKNOWN" }, "[agentic] Acompanhamento do GitHub Actions interrompido")
            write(githubFollowWarning(reasonOf(error)))
            return NOT_FOLLOWED
        }

        if (!queuedShown && !jobs.some((job) => job.status === "in_progress" || job.status === "completed")) {
            queuedShown = true
            write(githubQueuedLine())
        }
        write(diffSteps(seen, jobs))

        for (const job of jobs) {
            if (finalized.has(job.id) || !seen.jobs.has(job.id)) continue
            const completed = job.status === "completed"
            if (!completed && tick % LOG_EVERY_TICKS !== 0) continue
            if (completed && job.conclusion === "skipped") {
                finalized.add(job.id)
                write(githubJobEnd(job))
                continue
            }
            const text = await readLog(job.id)
            if (signal.aborted) return NOT_FOLLOWED
            if (text !== null) {
                logs.set(job.id, text)
                const chunk = completed ? text : completeLines(text)
                const from = written.get(job.id) ?? 0
                if (chunk.length > from) {
                    write(formatJobLog(chunk.slice(from)))
                    written.set(job.id, chunk.length)
                }
            }
            if (!completed) continue
            const missed = text === null ? (misses.get(job.id) ?? 0) + 1 : 0
            misses.set(job.id, missed)
            if (text === null && missed < LOG_MISSES) continue
            if (text === null) write("\x1b[90m(o log deste job não ficou disponível pela API do GitHub)\x1b[0m\n")
            finalized.add(job.id)
            write(githubJobEnd(job))
        }

        if (run?.status === "completed" && jobs.every((job) => finalized.has(job.id))) {
            const conclusion = run.conclusion ?? null
            const failure = conclusion === "success" ? null : failureExcerpt(jobs, logs)
            write(failure ? githubFailureBlock(failure) : githubRunDoneLine(conclusion))
            return { followed: true, conclusion, failure }
        }
        await sleep(pollMs, signal)
    }
}

export interface RunFollower {
    /** Trecho da saída do script: passa direto até a URL do run; depois, segura até o fim do acompanhamento. */
    output(chunk: string): void
    /** O script terminou: espera o acompanhamento (com teto), libera o que ficou retido e devolve o trecho da falha. */
    finish(): Promise<string | null>
}

/**
 * Liga o acompanhamento à saída do script da prévia: ao ver a URL do run do repositório da central,
 * começa a acompanhar e retém a saída seguinte do script (download, publicação) até o acompanhamento
 * acabar, para o log ficar na ordem comando → push/URL → GitHub Actions → publicação → exit.
 */
export function createRunFollower(input: {
    repo: string | null
    signal: AbortSignal
    write: (text: string) => void
    pollMs?: number
    finishTimeoutMs?: number
}): RunFollower {
    const inner = new AbortController()
    const signal = AbortSignal.any([input.signal, inner.signal])
    let pending = ""
    let held = ""
    let following: Promise<FollowResult> | null = null
    let done = false
    let result: FollowResult | null = null

    const release = () => {
        done = true
        if (held) input.write(held)
        held = ""
    }

    return {
        output(chunk) {
            if (following) {
                if (done) input.write(chunk)
                else held += chunk
                return
            }
            const before = pending.length
            const text = pending + chunk
            const lineEnd = text.lastIndexOf("\n")
            pending = lineEnd < 0 ? text : text.slice(lineEnd + 1)
            const lines = lineEnd < 0 ? "" : text.slice(0, lineEnd + 1)
            const ref = parseGithubRunUrl(lines)
            if (!ref || !input.repo || ref.repo.toLowerCase() !== input.repo.toLowerCase()) {
                input.write(chunk)
                return
            }
            // Escreve até o fim da linha da URL; o resto do trecho já é saída posterior do script.
            const urlAt = lines.lastIndexOf(`/actions/runs/${ref.runId}`)
            const cut = Math.max(0, lines.indexOf("\n", urlAt) + 1 - before)
            input.write(chunk.slice(0, cut))
            held = chunk.slice(cut)
            following = followGithubRun({ repo: ref.repo, runId: ref.runId, signal, write: input.write, pollMs: input.pollMs })
                .catch((error: unknown) => {
                    logger.warn({ repo: ref.repo, runId: ref.runId, err: error }, "[agentic] Falha no acompanhamento do GitHub Actions")
                    input.write(githubFollowWarning(reasonOf(error)))
                    return NOT_FOLLOWED
                })
                .then((value) => {
                    result = value
                    release()
                    return value
                })
        },
        async finish() {
            if (!following) return null
            let timer: ReturnType<typeof setTimeout> | null = null
            const timeout = new Promise<"timeout">((resolve) => {
                timer = setTimeout(() => resolve("timeout"), input.finishTimeoutMs ?? FINISH_TIMEOUT_MS)
            })
            const outcome = await Promise.race([following, timeout])
            if (timer) clearTimeout(timer)
            if (outcome === "timeout") {
                inner.abort()
                input.write("\n\x1b[33m⚠ O acompanhamento do GitHub Actions não terminou a tempo depois do fim do script; o restante da saída do workflow está no link da execução.\x1b[0m\n")
                await following
            }
            return result?.failure ?? null
        },
    }
}
