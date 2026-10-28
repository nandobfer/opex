import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import { AiProviderError } from "@/lib/ai/errors"
import { integrationDebug } from "@/lib/integrations/debug"
import { LOCAL_DOCKER_INTEGRATION_ID } from "../constants"
import { runDetached } from "./detached"

/**
 * Executa um comando no host do OpenCode (o servidor, fora do container do app) e espera terminar.
 * Os comandos vêm só de `../commands.ts` (nunca de texto livre).
 */

export interface HostResult {
    exitCode: number | null
    output: string
}

export interface HostRunOptions {
    /** Texto do debug no lugar do comando (comandos com segredo, ex.: importar a chave). */
    redactedAs?: string
    /** Saída ao vivo (lida aos pedaços com `shell.output({ cursor })`); o resultado traz a saída inteira. */
    onOutput?: (chunk: string) => void
    /**
     * Comando longo: roda desacoplado do shell do OpenCode (segundo plano no host + consultas curtas),
     * resistindo ao OpenCode descartar o shell no meio (ver `detached.ts`).
     */
    detached?: boolean
    /**
     * Id fixo do job desacoplado (padrão: aleatório). Rodar de novo com o mesmo id reencontra o job já
     * iniciado (o início é idempotente) — um processo novo retoma o comando de outro que morreu.
     */
    jobId?: string
    /** Intervalo entre as consultas do job desacoplado (padrão do `detached.ts`). */
    pollMs?: number
    /** Leitura sem efeito colateral: se o OpenCode descartar o shell no meio, repete uma vez. */
    retryOnLost?: boolean
    /** Não escreve no debug da integração (consultas repetitivas do executor desacoplado). */
    quiet?: boolean
    signal?: AbortSignal
}

/** O OpenCode descartou o shell no meio do comando ("Shell command not found"). */
export class HostShellLostError extends Error {
    constructor(public readonly shellId: string) {
        super("O OpenCode descartou o comando no meio (o diretório foi reciclado); tente de novo")
        this.name = "HostShellLostError"
    }
}

/** Erro do OpenCode de shell inexistente (404). */
export function isShellNotFound(error: unknown): boolean {
    if (!error || typeof error !== "object") return false
    const record = error as { message?: unknown; status?: unknown; response?: { status?: unknown }; _tag?: unknown; data?: { message?: unknown } }
    const text = [record.message, record.data?.message, record._tag].filter((item) => typeof item === "string").join(" ")
    return /Shell command not found|Shell\.NotFoundError/i.test(text) || record.status === 404 || record.response?.status === 404
}

export type HostRunner = (command: string, timeoutMs?: number, options?: HostRunOptions) => Promise<HostResult>

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
/** Debug da integração Builder Machine (só com o modo debug ligado). */
export const builderDebug = integrationDebug(LOCAL_DOCKER_INTEGRATION_ID)
const clip = (text: string, max = 600) => (text.length > max ? `${text.slice(0, max)}…` : text)

type HostDebug = ReturnType<typeof integrationDebug>

/** Executor no host que escreve no debug da integração indicada (Builder Machine ou outra que use o PC). */
export function createHostRunner(debug: HostDebug): HostRunner {
    return (command, timeoutMs, options) => runWithDebug(debug, command, timeoutMs, options)
}

export const runOnHost: HostRunner = (command, timeoutMs, options) => runWithDebug(builderDebug, command, timeoutMs, options)

async function runWithDebug(builderDebug: HostDebug, command: string, timeoutMs = 30_000, options: HostRunOptions = {}): Promise<HostResult> {
    if (options.detached) {
        const { onOutput, signal, redactedAs, jobId, pollMs } = options
        const short: HostRunner = (cmd, timeout, inner) => runWithDebug(builderDebug, cmd, timeout, { ...inner, detached: false })
        const result = await runDetached(short, command, { id: jobId, timeoutMs, onOutput, signal, redactedAs, pollMs })
        const line = `exit ${result.exitCode ?? "?"}${result.output ? ` — ${clip(lastLine(result.output), 300)}` : ""}`
        if (result.exitCode === 0) builderDebug.response(line)
        else builderDebug.warn(line)
        return result
    }
    if (options.retryOnLost) {
        try {
            return await runOnce(builderDebug, command, timeoutMs, options)
        } catch (error) {
            if (!(error instanceof HostShellLostError)) throw error
            return runOnce(builderDebug, command, timeoutMs, options)
        }
    }
    return runOnce(builderDebug, command, timeoutMs, options)
}

async function runOnce(builderDebug: HostDebug, command: string, timeoutMs: number, options: HostRunOptions): Promise<HostResult> {
    const client: OpencodeClient = await getOpencodeClient()
    const shown = options.redactedAs ?? clip(command)
    if (!options.quiet) builderDebug.request(`$ ${shown}`)
    let created: Awaited<ReturnType<OpencodeClient["shell"]["create"]>>
    try {
        created = await client.shell.create({ command, timeout: timeoutMs })
    } catch (error) {
        builderDebug.error(`Não foi possível executar no host: ${shown}`, error)
        throw new AiProviderError(`Não foi possível executar comandos no host do OpenCode: ${error instanceof Error ? error.message : String(error)}`)
    }
    const id = created.data.id
    let info = created.data
    const deadline = Date.now() + timeoutMs + 5_000
    try {
        let cursor = 0
        let streamed = ""
        const drain = async () => {
            const chunk = await client.shell.output({ id, cursor, limit: 64_000 }).catch(() => null)
            if (!chunk || !chunk.data.output) return
            cursor = chunk.data.cursor
            streamed += chunk.data.output
            options.onOutput?.(chunk.data.output)
        }
        while (info.status === "running" && Date.now() < deadline) {
            await sleep(300)
            try {
                info = (await client.shell.get({ id })).data
            } catch (error) {
                if (isShellNotFound(error)) {
                    if (!options.quiet) builderDebug.warn(`Shell ${id} descartado pelo OpenCode no meio do comando`)
                    throw new HostShellLostError(id)
                }
                throw error
            }
            if (options.onOutput) await drain()
        }
        let text: string
        if (options.onOutput) {
            await drain()
            text = streamed.trim()
        } else {
            const output = await client.shell.output({ id, limit: 20_000 }).catch(() => null)
            text = output?.data.output.trim() ?? ""
        }
        const result = { exitCode: typeof info.exit === "number" ? info.exit : null, output: text }
        const line = `exit ${result.exitCode ?? "?"}${result.output ? ` — ${clip(lastLine(result.output), 300)}` : ""}`
        if (options.quiet) return result
        if (result.exitCode === 0) builderDebug.response(line)
        else builderDebug.warn(line)
        return result
    } finally {
        // Os processos que o comando deixou em segundo plano (ssh -f) continuam vivos.
        await client.shell.remove({ id }).catch(() => undefined)
    }
}

/** Última linha útil da saída (onde costuma estar o erro), para mensagens curtas. */
export function lastLine(output: string): string {
    return (
        output
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .pop() ?? ""
    )
}
