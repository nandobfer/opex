import { getOpencodeConnection } from "@/lib/ai/opencode"
import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import { DomainError } from "@/lib/api/route"
import { integrationDebug } from "@/lib/integrations/debug"
import { createHostRunner, type HostRunner } from "@/features/local-docker/server/shell"
import { toDomainError } from "@/features/opencode-accounts/server/service"
import { homeCommand } from "../commands"

/**
 * Acesso ao host do OpenCode para os recursos — SOMENTE servidor. O app roda em container sem o disco do
 * host: arquivos são lidos/gravados pela API do OpenCode (`file.read`/`file.write`, caminhos absolutos)
 * e comandos (listar, mover, `tar`, `npx skills`) vão pelo `shell` dele, com debug na integração OpenCode.
 */

export interface OpencodeHost {
    client: OpencodeClient
    home: string
    /** Diretório das sessões configurado na integração (consultas do escopo global). */
    defaultDirectory: string | undefined
    run: HostRunner
    readText(path: string): Promise<string | null>
    writeText(path: string, text: string): Promise<void>
}

export const opencodeDebug = integrationDebug("ai_opencode")
const runner = createHostRunner(opencodeDebug)

const globalForHome = globalThis as unknown as { opencodeHostHome?: Map<string, string> }
const homes = (globalForHome.opencodeHostHome ??= new Map<string, string>())

/** Erro de arquivo inexistente da API do OpenCode. */
export function isFileNotFound(error: unknown): boolean {
    const record = (error && typeof error === "object" ? error : {}) as { _tag?: unknown; name?: unknown; message?: unknown }
    return record._tag === "FileNotFoundError" || record.name === "FileNotFoundError" || (typeof record.message === "string" && /File not found/i.test(record.message))
}

export async function openHost(): Promise<OpencodeHost> {
    let connection
    try {
        connection = await getOpencodeConnection()
    } catch (error) {
        throw toDomainError(error)
    }
    const client = await getOpencodeClient(connection)
    let home = homes.get(connection.baseUrl)
    if (!home) {
        const result = await runner(homeCommand(), 15_000, { quiet: true, retryOnLost: true }).catch((error: unknown) => {
            throw toDomainError(error)
        })
        home = result.output.trim()
        if (result.exitCode !== 0 || !home.startsWith("/")) throw new DomainError(502, "Não foi possível descobrir a pasta do usuário no host do OpenCode", "OPENCODE_HOST_HOME")
        homes.set(connection.baseUrl, home)
    }
    return {
        client,
        home,
        defaultDirectory: connection.directory,
        run: runner,
        async readText(path) {
            try {
                const bytes = await client.file.read({ path })
                return new TextDecoder().decode(bytes)
            } catch (error) {
                if (isFileNotFound(error)) return null
                throw toDomainError(error)
            }
        },
        async writeText(path, text) {
            try {
                await client.file.write({ path, payload: new TextEncoder().encode(text) })
            } catch (error) {
                throw toDomainError(error)
            }
        },
    }
}

/** Saída de um comando no host que precisa dar certo (`DomainError` 502 com a última linha). */
export async function runOrFail(host: OpencodeHost, command: string, failure: string, timeoutMs = 30_000, options: Parameters<HostRunner>[2] = {}): Promise<string> {
    const result = await host.run(command, timeoutMs, options)
    if (result.exitCode !== 0) {
        const last = result.output.trim().split("\n").filter(Boolean).at(-1) ?? ""
        throw new DomainError(502, `${failure}${last ? `: ${last.slice(0, 300)}` : ""}`, "OPENCODE_HOST_COMMAND_FAILED")
    }
    return result.output
}
