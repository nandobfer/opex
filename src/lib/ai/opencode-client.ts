import { OpenCode } from "@opencode/client"
import { AiProviderError } from "./errors"
import { getOpencodeConnection } from "./opencode"

/**
 * Cliente oficial do OpenCode 2.x (`@opencode/client`) — SOMENTE servidor. Usado pelas sessões
 * longas do desenvolvimento agêntico, que precisam do que o `streamAi` não oferece: retomar a mesma
 * sessão, trocar agente/modelo entre etapas, responder permissões e perguntas, interromper, mover a
 * sessão e executar comandos de verificação (`shell`). Gerações curtas continuam no `streamAi`.
 */

export type OpencodeClient = ReturnType<typeof OpenCode.make>

export async function getOpencodeClient(): Promise<OpencodeClient> {
    const conn = await getOpencodeConnection()
    const { Accept: _accept, ...headers } = conn.headers
    void _accept
    return OpenCode.make({ baseUrl: conn.baseUrl, headers })
}

export interface OpencodeShellResult {
    exitCode: number | null
    status: string
    output: string
}

const sleep = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, ms)
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer)
                reject(signal.reason instanceof Error ? signal.reason : new Error("Operação cancelada"))
            },
            { once: true },
        )
    })

/**
 * Executa um comando na máquina do OpenCode (no diretório informado) e espera terminar. Usado nos
 * testes da central (git, gh, docker) — nunca com texto vindo de terceiros.
 */
export async function runOpencodeShell(
    client: OpencodeClient,
    directory: string,
    command: string,
    options: { timeoutMs?: number; signal?: AbortSignal; outputLimit?: number } = {},
): Promise<OpencodeShellResult> {
    const timeoutMs = options.timeoutMs ?? 30_000
    const location = { directory }
    let created: Awaited<ReturnType<OpencodeClient["shell"]["create"]>>
    try {
        created = await client.shell.create({ location, command, timeout: timeoutMs }, { signal: options.signal })
    } catch (error) {
        throw new AiProviderError(`Não foi possível executar comandos no OpenCode: ${error instanceof Error ? error.message : String(error)}`)
    }
    const id = created.data.id
    const deadline = Date.now() + timeoutMs + 5_000
    let info = created.data
    try {
        while (info.status === "running" && Date.now() < deadline) {
            await sleep(400, options.signal)
            info = (await client.shell.get({ id, location }, { signal: options.signal })).data
        }
        const output = await client.shell.output({ id, location, limit: options.outputLimit ?? 20_000 }, { signal: options.signal }).catch(() => null)
        return { exitCode: typeof info.exit === "number" ? info.exit : null, status: info.status, output: output?.data.output.trim() ?? "" }
    } finally {
        await client.shell.remove({ id, location }).catch(() => undefined)
    }
}

/**
 * Executa um comando longo na máquina do OpenCode entregando a saída aos poucos (cursor), até o
 * comando terminar, o prazo vencer ou o `signal` abortar. Ao abortar, o shell é removido — o que
 * encerra o processo no host. Usado para acompanhar logs (`docker compose logs -f`).
 */
export async function streamOpencodeShell(
    client: OpencodeClient,
    directory: string,
    command: string,
    options: {
        onOutput: (chunk: string) => void | Promise<void>
        onStart?: (shellId: string) => void | Promise<void>
        signal?: AbortSignal
        timeoutMs?: number
        intervalMs?: number
    },
): Promise<OpencodeShellResult> {
    const timeoutMs = options.timeoutMs ?? 4 * 60 * 60_000
    const location = { directory }
    let created: Awaited<ReturnType<OpencodeClient["shell"]["create"]>>
    try {
        created = await client.shell.create({ location, command, timeout: timeoutMs })
    } catch (error) {
        throw new AiProviderError(`Não foi possível executar comandos no OpenCode: ${error instanceof Error ? error.message : String(error)}`)
    }
    const id = created.data.id
    await options.onStart?.(id)
    let info = created.data
    let cursor = 0
    const drain = async () => {
        const page = (await client.shell.output({ id, location, cursor, limit: 64_000 })).data
        if (page.output) await options.onOutput(page.output)
        cursor = page.cursor
    }
    try {
        while (!options.signal?.aborted) {
            await drain()
            if (info.status !== "running") break
            try {
                await sleep(options.intervalMs ?? 1_000, options.signal)
            } catch {
                break
            }
            info = (await client.shell.get({ id, location })).data
        }
        return { exitCode: typeof info.exit === "number" ? info.exit : null, status: info.status, output: "" }
    } finally {
        await client.shell.remove({ id, location }).catch(() => undefined)
    }
}
