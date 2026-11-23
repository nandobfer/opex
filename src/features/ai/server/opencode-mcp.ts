import type { OpencodeClient } from "@/lib/ai/opencode-client"
import { logger } from "@/lib/logger"

/**
 * Registro de um MCP remoto do Opex no OpenCode, por diretório (OPE-178: compartilhado pelo MCP de
 * memórias `opex_memorias` e pelo MCP da mesa `opex_mesa`). Uma vez por processo, servidor e diretório;
 * cada diretório é independente: o que ainda não existe no host vai para `skipped` e uma falha não impede
 * os demais. Nunca lança.
 */

export interface RemoteMcpRegistration {
    ok: boolean
    error: string | null
    /** Diretórios pulados porque ainda não existem (não é falha: o registro acontece quando existirem). */
    skipped: string[]
}

export interface RemoteMcpTarget {
    server: string
    url: string
    secret: string
    /** Nome legível nos logs (ex.: "MCP de memórias"). */
    label: string
}

const globalRegistry = globalThis as unknown as { __opexRemoteMcpRegistered?: Set<string> }
const registered = (globalRegistry.__opexRemoteMcpRegistered ??= new Set())

/** Diretório que (ainda) não existe no host: ex. o worktree antes de o agente de implementação criá-lo. */
export function isMissingDirectoryError(error: unknown): boolean {
    if (typeof error === "object" && error !== null && (error as { _tag?: unknown })._tag === "LocationNotFoundError") return true
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
    return /location not found/i.test(message)
}

/** `ok: true` quando ao menos um diretório tem o MCP; `ok: false` quando nenhum foi registrado (por erro ou por não existir). */
export async function ensureRemoteMcp(client: OpencodeClient, target: RemoteMcpTarget, directories: readonly (string | null | undefined)[]): Promise<RemoteMcpRegistration> {
    const skipped: string[] = []
    let succeeded = 0
    let failure: string | null = null
    for (const directory of [...new Set(directories.filter((item): item is string => Boolean(item)))]) {
        try {
            const key = `${target.server}|${directory}|${target.url}`
            const location = { location: { directory } }
            const present = new Set(
                await client.mcp
                    .list(location)
                    .then((result) => result.data.map((server) => server.name))
                    .catch(() => [] as string[]),
            )
            if (registered.has(key) && present.has(target.server)) {
                succeeded++
                continue
            }
            if (present.has(target.server)) await client.mcp.remove({ server: target.server, ...location }).catch(() => undefined)
            await client.mcp.add({ server: target.server, ...location, config: { type: "remote", url: target.url, headers: { Authorization: `Bearer ${target.secret}` }, oauth: false, timeout: { execution: 120_000 } } })
            registered.add(key)
            succeeded++
        } catch (error) {
            if (isMissingDirectoryError(error)) {
                skipped.push(directory)
                logger.info({ directory, server: target.server }, `[ai] diretório ainda inexistente no OpenCode: ${target.label} não registrado nele por enquanto`)
                continue
            }
            failure = error instanceof Error ? error.message : String(error)
            logger.warn({ err: failure, directory, server: target.server }, `[ai] não foi possível registrar o ${target.label} neste diretório`)
        }
    }
    // Nenhum diretório registrado: as ferramentas não existem em lugar nenhum (não anunciar ao agente).
    if (succeeded === 0 && failure) return { ok: false, error: failure, skipped }
    if (succeeded === 0 && skipped.length) return { ok: false, error: `diretório inexistente no host: ${skipped.join(", ")}`, skipped }
    return { ok: true, error: null, skipped }
}
