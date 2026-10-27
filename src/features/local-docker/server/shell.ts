import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import { AiProviderError } from "@/lib/ai/errors"
import { integrationDebug } from "@/lib/integrations/debug"
import { LOCAL_DOCKER_INTEGRATION_ID } from "../constants"

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
}

export type HostRunner = (command: string, timeoutMs?: number, options?: HostRunOptions) => Promise<HostResult>

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
/** Debug da integração Builder Machine (só com o modo debug ligado). */
export const builderDebug = integrationDebug(LOCAL_DOCKER_INTEGRATION_ID)
const clip = (text: string, max = 600) => (text.length > max ? `${text.slice(0, max)}…` : text)

export const runOnHost: HostRunner = async (command, timeoutMs = 30_000, options = {}) => {
    const client: OpencodeClient = await getOpencodeClient()
    const shown = options.redactedAs ?? clip(command)
    builderDebug.request(`$ ${shown}`)
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
        while (info.status === "running" && Date.now() < deadline) {
            await sleep(300)
            info = (await client.shell.get({ id })).data
        }
        const output = await client.shell.output({ id, limit: 20_000 }).catch(() => null)
        const result = { exitCode: typeof info.exit === "number" ? info.exit : null, output: output?.data.output.trim() ?? "" }
        const line = `exit ${result.exitCode ?? "?"}${result.output ? ` — ${clip(lastLine(result.output), 300)}` : ""}`
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
