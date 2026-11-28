import type { OpencodeClient } from "@nandobfer/integracoes/modules/integrations/ia/ai/opencode-client"
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
    /**
     * Só conta como registrado o diretório em que o OpenCode informa o servidor `connected` (OPE-178):
     * URL pública inalcançável a partir do host ou segredo divergente deixam o servidor `failed`.
     */
    requireConnected?: boolean
}

/** Leituras do status depois de registrar (o OpenCode pode levar um instante para conectar). */
export const REMOTE_MCP_STATUS_POLLS = 5
export const REMOTE_MCP_STATUS_POLL_MS = 200

type McpListing = Map<string, { status: string | null; error: string | null }>

async function listServers(client: OpencodeClient, location: { location: { directory: string } }): Promise<McpListing> {
    const result = await client.mcp.list(location).catch(() => null)
    const listing: McpListing = new Map()
    for (const server of result?.data ?? []) {
        const status = (server as { status?: { status?: unknown; error?: unknown; message?: unknown } }).status
        listing.set(server.name, { status: typeof status?.status === "string" ? status.status : null, error: typeof status?.error === "string" ? status.error : typeof status?.message === "string" ? status.message : null })
    }
    return listing
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Status final do servidor no diretório depois do registro (`connected` ou o motivo da falha). */
async function awaitConnected(client: OpencodeClient, server: string, location: { location: { directory: string } }): Promise<string | null> {
    let last: { status: string | null; error: string | null } | undefined
    for (let poll = 0; poll < REMOTE_MCP_STATUS_POLLS; poll++) {
        if (poll > 0) await pause(REMOTE_MCP_STATUS_POLL_MS)
        last = (await listServers(client, location)).get(server)
        if (last?.status === "connected") return null
        if (last?.status && last.status !== "pending" && last.status !== "connecting") break
    }
    return `o OpenCode não conectou ao servidor ${server} (status: ${last?.status ?? "desconhecido"}${last?.error ? ` — ${last.error}` : ""})`
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
            const listing = await listServers(client, location)
            const current = listing.get(target.server)
            const healthy = current !== undefined && (!target.requireConnected || current.status === "connected")
            if (registered.has(key) && healthy) {
                succeeded++
                continue
            }
            if (current) await client.mcp.remove({ server: target.server, ...location }).catch(() => undefined)
            await client.mcp.add({ server: target.server, ...location, config: { type: "remote", url: target.url, headers: { Authorization: `Bearer ${target.secret}` }, oauth: false, timeout: { execution: 120_000 } } })
            if (target.requireConnected) {
                const problem = await awaitConnected(client, target.server, location)
                if (problem) {
                    registered.delete(key)
                    failure = problem
                    logger.warn({ err: problem, directory, server: target.server }, `[ai] o ${target.label} foi registrado, mas não conectou neste diretório`)
                    continue
                }
            }
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
