import { GithubError, githubRequestFull, githubRequestText, type GithubResponse } from "@/features/github/client"
import { logger } from "@/lib/logger"
import {
    diffSteps,
    emptyStepsSeen,
    failureExcerpt,
    formatJobLog,
    githubFailureBlock,
    githubFollowWarning,
    githubJobEnd,
    githubQueuedLine,
    githubRunDoneLine,
    githubStepEnd,
    parseGithubRunUrl,
    type GithubRunRef,
    type StepEvent,
    type GithubJob,
} from "../github-run-log"

/**
 * Acompanhamento do run do GitHub Actions da prévia remota (OPE-214), pela integração GitHub: enquanto o
 * script da prévia espera o run em silêncio, o servidor escreve no log do build as etapas ao vivo, o log
 * de cada etapa assim que ela termina (endpoint de log por etapa: o log do job inteiro só existe no fim
 * do job) e, na falha, o trecho que a explica. É melhor esforço: qualquer falha vira uma linha de aviso
 * no próprio log e o build segue pelo código de saída do script.
 */

/** Intervalo entre as consultas do run e dos jobs (com ETag: o 304 não gasta o limite de uso). */
export const FOLLOW_POLL_MS = 5_000
/** Consultas sem o log de uma etapa (ou do job) já concluída antes de desistir dele (o log pode demorar a sair). */
const LOG_MISSES = 6
/** Consultas com o run concluído e nenhum job listado antes de encerrar (atraso de consistência da API). */
const EMPTY_JOBS_TICKS = 6
/** Falhas transitórias seguidas (rede, 5xx) antes de desistir do acompanhamento. */
const MAX_ERRORS = 4
/** Teto da espera pelo fim do acompanhamento depois que o script terminou. */
export const FINISH_TIMEOUT_MS = 60_000

const UNAVAILABLE_STEP_LOG = "\x1b[90m(o log desta etapa não ficou disponível pela API do GitHub; as próximas etapas deste job saem sem log)\x1b[0m\n"
const UNAVAILABLE_JOB_LOG = "\x1b[90m(o log deste job não ficou disponível pela API do GitHub)\x1b[0m\n"
const PARTIAL_JOB_LOG = "\x1b[90m(parte do log deste job não veio pela API do GitHub; o log completo está no link da execução)\x1b[0m\n"
const NO_JOBS = "\x1b[90m(o GitHub não listou nenhum job deste run)\x1b[0m\n"

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
    /** Log cru já obtido de cada job (etapas concatenadas ou o job inteiro): base do trecho da falha. */
    const logs = new Map<number, string>()
    /** Etapas com log escrito, por job. */
    const stepLogs = new Map<number, number>()
    /** Jobs em que o log por etapa não veio: as etapas seguintes saem sem log. */
    const noStepLogs = new Set<number>()
    const finalized = new Set<number>()
    const misses = new Map<string, number>()
    let pending: StepEvent[] = []
    let jobs: GithubJob[] = []
    let run: RunInfo | null = null
    let runEtag: string | null = null
    let jobsEtag: string | null = null
    let queuedShown = false
    let errors = 0
    let emptyTicks = 0

    const readLog = async (path: string): Promise<string | null> => {
        try {
            return await githubRequestText(path, { signal, label: "log do Actions" })
        } catch {
            return null
        }
    }
    /** Mais uma consulta sem o log; `true` = desistiu dele. */
    const missed = (key: string) => {
        const count = (misses.get(key) ?? 0) + 1
        misses.set(key, count)
        return count >= LOG_MISSES
    }
    const keep = (jobId: number, text: string) => logs.set(jobId, (logs.get(jobId) ?? "") + text)

    for (;;) {
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
        pending.push(...diffSteps(seen, jobs))

        // Na ordem do job: uma etapa concluída ainda sem log segura o que vem depois no mesmo job.
        const blocked = new Set<number>()
        const waiting: StepEvent[] = []
        for (const item of pending) {
            const { jobId } = item
            if (blocked.has(jobId)) {
                waiting.push(item)
                continue
            }
            if (item.kind === "text") {
                write(item.text)
                continue
            }
            const { step } = item
            if (step.conclusion !== "skipped" && !noStepLogs.has(jobId)) {
                const text = await readLog(`/repos/${repo}/actions/jobs/${jobId}/steps/${step.number}/logs`)
                if (signal.aborted) return NOT_FOLLOWED
                if (text !== null) {
                    keep(jobId, text)
                    stepLogs.set(jobId, (stepLogs.get(jobId) ?? 0) + 1)
                    write(formatJobLog(text))
                } else if (missed(`${jobId}:${step.number}`)) {
                    noStepLogs.add(jobId)
                    write(UNAVAILABLE_STEP_LOG)
                } else {
                    blocked.add(jobId)
                    waiting.push(item)
                    continue
                }
            }
            write(githubStepEnd(step))
        }
        pending = waiting

        for (const job of jobs) {
            if (finalized.has(job.id) || !seen.jobs.has(job.id) || job.status !== "completed") continue
            if (pending.some((item) => item.jobId === job.id)) continue
            const hasSteps = (job.steps ?? []).some((step) => step.conclusion !== "skipped")
            if (hasSteps && noStepLogs.has(job.id)) {
                if (stepLogs.get(job.id)) write(PARTIAL_JOB_LOG)
                else {
                    // Sem nenhuma etapa com log: o log do job inteiro (só existe com o job concluído).
                    const text = await readLog(`/repos/${repo}/actions/jobs/${job.id}/logs`)
                    if (signal.aborted) return NOT_FOLLOWED
                    if (text !== null) {
                        keep(job.id, text)
                        write(formatJobLog(text))
                    } else if (missed(`job:${job.id}`)) write(UNAVAILABLE_JOB_LOG)
                    else continue
                }
            }
            finalized.add(job.id)
            write(githubJobEnd(job))
        }

        if (run?.status === "completed" && !pending.length && jobs.every((job) => finalized.has(job.id))) {
            // Run concluído sem nenhum job listado: pode ser atraso de consistência da API; espera um pouco.
            if (!jobs.length && ++emptyTicks < EMPTY_JOBS_TICKS) {
                jobsEtag = null
                await sleep(pollMs, signal)
                continue
            }
            if (!jobs.length) write(NO_JOBS)
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
    /** O build saiu por erro: encerra o acompanhamento na hora (nada mais vai ao log) e libera o que ficou retido. */
    abort(): void
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
    /** O run do repositório da central foi reconhecido (uma vez por execução do script). */
    onRun?: (ref: GithubRunRef) => void
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
            try {
                input.onRun?.(ref)
            } catch (error) {
                logger.warn({ repo: ref.repo, runId: ref.runId, err: error }, "[agentic] Falha ao registrar o run do GitHub Actions no build")
            }
            // Depois do abort, nada do acompanhamento vai ao log (o build pode já ser outro).
            const write = (text: string) => {
                if (!inner.signal.aborted) input.write(text)
            }
            following = followGithubRun({ repo: ref.repo, runId: ref.runId, signal, write, pollMs: input.pollMs })
                .catch((error: unknown) => {
                    logger.warn({ repo: ref.repo, runId: ref.runId, err: error }, "[agentic] Falha no acompanhamento do GitHub Actions")
                    write(githubFollowWarning(reasonOf(error)))
                    return NOT_FOLLOWED
                })
                .then((value) => {
                    result = value
                    if (!inner.signal.aborted) release()
                    return value
                })
        },
        abort() {
            if (inner.signal.aborted) return
            inner.abort()
            if (following && !done) release()
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
                release()
            }
            return result?.failure ?? null
        },
    }
}
