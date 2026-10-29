import { randomBytes } from "node:crypto"
import { detachedCancelCommand, detachedCleanupCommand, detachedPollCommand, detachedStartCommand, parseDetachedPoll } from "../detached-commands"
import type { HostResult, HostRunner } from "./shell"

/**
 * Executor desacoplado: roda o comando longo em segundo plano no host e acompanha por consultas
 * curtas (cada uma num shell próprio do OpenCode). Se o OpenCode descartar um shell de consulta
 * ("Shell command not found"), a consulta é só repetida — o processo de verdade segue vivo.
 */

export interface DetachedOptions {
    /** Id do job (pasta no host); padrão: aleatório. */
    id?: string
    timeoutMs: number
    onOutput?: (chunk: string) => void
    signal?: AbortSignal
    /** Texto do debug no lugar do comando. */
    redactedAs?: string
    /** Intervalo entre as consultas. */
    pollMs?: number
}

/** Saída guardada no resultado (o fim, que é onde ficam os erros). */
const OUTPUT_MAX = 1_000_000
/** Consultas seguidas que falham antes de desistir (o host sumiu de vez). */
const MAX_POLL_FAILURES = 40
/** Folga além do timeout do comando (o `timeout` do host encerra antes). */
const DEADLINE_GRACE_MS = 30_000
/** Depois de cancelar, espera o job fechar no máximo isto (o cancelamento grava o `exit`). */
const CANCEL_GRACE_MS = 15_000

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const newJobId = (prefix = "job") => `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`

/** `run` é o executor curto (um shell do OpenCode por chamada). */
export async function runDetached(run: HostRunner, command: string, options: DetachedOptions): Promise<HostResult> {
    const id = options.id ?? newJobId()
    const pollMs = options.pollMs ?? 1_500
    const started = await run(detachedStartCommand(id, command, options.timeoutMs / 1000), 30_000, { redactedAs: `[job ${id}] ${options.redactedAs ?? command}`, retryOnLost: true })
    if (started.exitCode !== 0 || !started.output.includes("started")) {
        return { exitCode: started.exitCode ?? 1, output: started.output || "Não foi possível iniciar o comando em segundo plano no host" }
    }
    const decoder = new TextDecoder("utf-8")
    let offset = 0
    let output = ""
    let failures = 0
    let cancelledAt: number | null = null
    const deadline = Date.now() + options.timeoutMs + DEADLINE_GRACE_MS
    const cancel = async () => {
        if (cancelledAt !== null) return
        cancelledAt = Date.now()
        await run(detachedCancelCommand(id), 30_000, { quiet: true, retryOnLost: true }).catch(() => undefined)
    }
    const emit = (text: string) => {
        if (!text) return
        output = (output + text).slice(-OUTPUT_MAX)
        options.onOutput?.(text)
    }
    try {
        for (;;) {
            if (options.signal?.aborted) await cancel()
            if (Date.now() > deadline || (cancelledAt !== null && Date.now() > cancelledAt + CANCEL_GRACE_MS)) {
                await cancel()
                emit(decoder.decode())
                return { exitCode: null, output: output.trim() }
            }
            let poll
            try {
                poll = parseDetachedPoll((await run(detachedPollCommand(id, offset), 30_000, { quiet: true, retryOnLost: true })).output)
                failures = 0
            } catch (error) {
                // Shell descartado pelo OpenCode (ou falha passageira do host): só repete a consulta.
                if (++failures >= MAX_POLL_FAILURES) throw error
                await sleep(pollMs)
                continue
            }
            if (poll.missing) {
                emit(decoder.decode())
                return { exitCode: null, output: `${output}\nO comando sumiu do host (pasta do job apagada ou host reiniciado)`.trim() }
            }
            if (poll.chunk.length) {
                offset += poll.chunk.length
                emit(decoder.decode(poll.chunk, { stream: true }))
            }
            if (poll.exitCode !== null && offset >= poll.size) {
                emit(decoder.decode())
                return { exitCode: poll.exitCode, output: output.trim() }
            }
            // Ainda há saída para ler: consulta logo em seguida.
            if (poll.chunk.length === 0 || offset >= poll.size) await sleep(pollMs)
        }
    } finally {
        await run(detachedCleanupCommand(id), 30_000, { quiet: true, retryOnLost: true }).catch(() => undefined)
    }
}
