import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import { AiProviderError } from "@/lib/ai/errors"
import { OPEX_HOST_OUTPUT_MAX } from "../constants"

/**
 * Executor do terminal do host: roda um comando na máquina do OpenCode pelo `shell` dele (fora do
 * container do app). Não interativo: espera terminar ou estourar o tempo e devolve o fim da saída.
 */

export interface HostCommandResult {
    status: "exited" | "timeout" | "killed" | "running"
    exitCode: number | null
    signal: string | null
    /** Diretório em que o comando rodou (informado pelo OpenCode). */
    cwd: string | null
    durationMs: number
    output: string
    /** A saída passou do limite: `output` traz só o fim. */
    truncated: boolean
    outputSize: number
}

const POLL_MS = 400

const sleep = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(new Error("Operação cancelada"))
        const timer = setTimeout(resolve, ms)
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer)
                reject(new Error("Operação cancelada"))
            },
            { once: true },
        )
    })

type Location = { directory: string } | undefined

/** Saída do comando: o começo; se passou do limite, o fim (`cursor` = deslocamento na saída). */
async function readOutput(client: OpencodeClient, id: string, location: Location, signal?: AbortSignal): Promise<{ output: string; truncated: boolean; size: number }> {
    const first = (await client.shell.output({ id, location, limit: OPEX_HOST_OUTPUT_MAX }, { signal })).data
    const size = first.size
    if (size <= first.output.length && !first.truncated) return { output: first.output, truncated: false, size }
    const tail = await client.shell
        .output({ id, location, cursor: Math.max(0, size - OPEX_HOST_OUTPUT_MAX), limit: OPEX_HOST_OUTPUT_MAX }, { signal })
        .then((res) => res.data.output)
        .catch(() => null)
    return { output: tail ?? first.output, truncated: true, size }
}

export async function runHostCommand(command: string, directory: string | null, options: { timeoutMs: number; signal?: AbortSignal }): Promise<HostCommandResult> {
    const client = await getOpencodeClient()
    const location: Location = directory ? { directory } : undefined
    const startedAt = Date.now()
    let created: Awaited<ReturnType<OpencodeClient["shell"]["create"]>>
    try {
        created = await client.shell.create({ location, command, timeout: options.timeoutMs }, { signal: options.signal })
    } catch (error) {
        throw new AiProviderError(`Não foi possível executar o comando no OpenCode${directory ? ` (em ${directory})` : ""}: ${error instanceof Error ? error.message : String(error)}`)
    }
    const id = created.data.id
    let info = created.data
    const deadline = startedAt + options.timeoutMs + 5_000
    try {
        while (info.status === "running" && Date.now() < deadline) {
            await sleep(POLL_MS, options.signal)
            info = (await client.shell.get({ id, location }, { signal: options.signal })).data
        }
        const output = await readOutput(client, id, location, options.signal).catch(() => ({ output: "", truncated: false, size: 0 }))
        return {
            status: info.status,
            exitCode: typeof info.exit === "number" ? info.exit : null,
            signal: info.signal ?? null,
            cwd: info.cwd || directory,
            durationMs: Date.now() - startedAt,
            output: output.output.trimEnd(),
            truncated: output.truncated,
            outputSize: output.size,
        }
    } finally {
        // Remover também encerra o comando que ainda roda (tempo esgotado ou turno interrompido).
        await client.shell.remove({ id, location }).catch(() => undefined)
    }
}
