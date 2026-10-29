import { OpenCode } from "@opencode/client"
import { AiProviderError } from "./errors"
import { getOpencodeConnection, type OpencodeConnection } from "./opencode"

/**
 * Cliente oficial do OpenCode 2.x (`@opencode/client`) — SOMENTE servidor. Usado pelas sessões
 * longas do desenvolvimento agêntico, que precisam do que o `streamAi` não oferece: retomar a mesma
 * sessão, trocar agente/modelo entre etapas, responder permissões e perguntas, interromper, mover a
 * sessão e executar comandos de verificação (`shell`). Gerações curtas continuam no `streamAi`.
 */

export type OpencodeClient = ReturnType<typeof OpenCode.make>

export async function getOpencodeClient(connection?: OpencodeConnection): Promise<OpencodeClient> {
    const conn = connection ?? (await getOpencodeConnection())
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
    options: { timeoutMs?: number; signal?: AbortSignal } = {},
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
        const output = await client.shell.output({ id, location, limit: 20_000 }, { signal: options.signal }).catch(() => null)
        return { exitCode: typeof info.exit === "number" ? info.exit : null, status: info.status, output: output?.data.output.trim() ?? "" }
    } finally {
        await client.shell.remove({ id, location }).catch(() => undefined)
    }
}
