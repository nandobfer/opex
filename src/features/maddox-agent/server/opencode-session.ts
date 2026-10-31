import { timingSafeEqual } from "node:crypto"
import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import { getOpencodeConnection } from "@/lib/ai/opencode"
import { DomainError } from "@/lib/api/route"
import { deriveSubkey } from "@/lib/crypto/secretBox"
import { loggerFor } from "@/lib/logger"
import { MADDOX_INSTRUCTIONS_KEY, MADDOX_MCP_SERVERS, maddoxMcpPath, type MaddoxMcpScope } from "../constants"
import type { MaddoxPermissionRule } from "../permissions"

/**
 * Sessão do OpenCode do Agente Maddox (SOMENTE servidor): o servidor MCP do Opex registrado no
 * OpenCode, a sessão (no diretório padrão da integração OpenCode), as permissões e as instruções.
 */

const log = loggerFor({ module: "maddox-agent" })

/** Segredo do servidor MCP do Opex: derivado da chave das integrações (nunca gravado nem exposto). */
export function maddoxMcpSecret(): string | null {
    return deriveSubkey("maddox-mcp:v1")?.toString("base64url") ?? null
}

/** Confere o `Authorization: Bearer …` de uma chamada do OpenCode ao servidor MCP (tempo constante). */
export function isMaddoxMcpAuthorized(authorization: string | null): boolean {
    const secret = maddoxMcpSecret()
    if (!secret || !authorization?.startsWith("Bearer ")) return false
    const given = Buffer.from(authorization.slice(7).trim())
    const expected = Buffer.from(secret)
    return given.length === expected.length && timingSafeEqual(given, expected)
}

/** Diretório das sessões: o padrão do serviço OpenCode (integração), sem campo próprio. */
export async function maddoxDirectory(): Promise<string | undefined> {
    return (await getOpencodeConnection()).directory
}

const locationOf = (directory: string | undefined) => (directory ? { location: { directory } } : {})

/** MCPs já registrados neste processo (`diretório|url`): o registro sobrevive enquanto o OpenCode não reinicia. */
const globalRegistry = globalThis as unknown as { __maddoxMcpRegistered?: Set<string> }
const registered = (globalRegistry.__maddoxMcpRegistered ??= new Set())

export interface MaddoxMcpStatus {
    scope: MaddoxMcpScope
    name: string
    state: "connected" | "pending" | "disabled" | "failed" | "needs_auth" | "missing"
    error: string | null
}

/**
 * Registra (ou atualiza) os dois servidores MCP do Opex no OpenCode, no diretório das sessões. Sem a
 * URL base ou sem a chave das integrações, o Maddox fica sem as ferramentas do Opex (aviso no turno).
 * `force`: regrava mesmo já registrado (URL nova ao salvar a configuração).
 */
export async function ensureMaddoxMcp(client: OpencodeClient, directory: string | undefined, baseUrl: string | null, options: { force?: boolean } = {}): Promise<{ ok: boolean; error: string | null }> {
    if (!baseUrl) return { ok: false, error: "Salve a configuração do Agente Maddox no navegador para registrar o endereço do Opex" }
    const secret = maddoxMcpSecret()
    if (!secret) return { ok: false, error: "Defina INTEGRATIONS_ENCRYPTION_KEY para o OpenCode acessar as ferramentas do Opex" }
    const base = baseUrl.replace(/\/+$/, "")
    const present = new Set(
        await client.mcp
            .list(locationOf(directory))
            .then((result) => result.data.map((server) => server.name))
            .catch(() => [] as string[]),
    )
    try {
        for (const scope of Object.keys(MADDOX_MCP_SERVERS) as MaddoxMcpScope[]) {
            const name = MADDOX_MCP_SERVERS[scope]
            const url = `${base}${maddoxMcpPath(scope)}`
            const key = `${directory ?? ""}|${name}|${url}`
            if (!options.force && registered.has(key) && present.has(name)) continue
            if (present.has(name)) await client.mcp.remove({ server: name, ...locationOf(directory) }).catch(() => undefined)
            await client.mcp.add({
                server: name,
                ...locationOf(directory),
                config: { type: "remote", url, headers: { Authorization: `Bearer ${secret}` }, oauth: false, timeout: { execution: 600_000 } },
            })
            registered.add(key)
        }
        return { ok: true, error: null }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.warn({ err: message }, "[maddox] não foi possível registrar o MCP do Opex no OpenCode")
        return { ok: false, error: `Não foi possível registrar o MCP do Opex no OpenCode: ${message}` }
    }
}

/** Situação dos MCPs do Opex no OpenCode (tela de configuração). */
export async function maddoxMcpStatus(): Promise<MaddoxMcpStatus[]> {
    const client = await getOpencodeClient()
    const directory = await maddoxDirectory()
    const servers = await client.mcp.list(locationOf(directory)).then((result) => result.data)
    return (Object.keys(MADDOX_MCP_SERVERS) as MaddoxMcpScope[]).map((scope) => {
        const name = MADDOX_MCP_SERVERS[scope]
        const server = servers.find((item) => item.name === name)
        if (!server) return { scope, name, state: "missing", error: null }
        const status = server.status as { status: string; error?: string }
        const state = (["connected", "pending", "disabled", "failed", "needs_auth"] as const).find((item) => item === status.status) ?? "pending"
        return { scope, name, state, error: typeof status.error === "string" ? status.error : null }
    })
}

/** Cria a sessão do OpenCode do Maddox (com as permissões do escopo). */
export async function createOpencodeSession(
    client: OpencodeClient,
    input: { directory: string | undefined; title: string; sessionId: string; permissions: readonly MaddoxPermissionRule[] },
): Promise<string> {
    const session = await client.session.create({
        title: input.title,
        ...(input.directory ? { location: { directory: input.directory } } : {}),
        metadata: { app: "opex", kind: "maddox", sessionId: input.sessionId },
        permissions: [...input.permissions],
    })
    return session.id
}

/** Permissões e instruções da sessão, regravadas a cada turno (ferramenta desligada some no turno seguinte). */
export async function applySessionSetup(client: OpencodeClient, opencodeSessionId: string, setup: { permissions: readonly MaddoxPermissionRule[]; instructions: string }): Promise<void> {
    await client.session.update({ sessionID: opencodeSessionId, permissions: [...setup.permissions] })
    await client.session.instructions.entry.put({ sessionID: opencodeSessionId, key: MADDOX_INSTRUCTIONS_KEY, value: setup.instructions })
}

/** A sessão do OpenCode ainda existe? (`false` = removida no host; uma nova será criada.) */
export async function opencodeSessionExists(client: OpencodeClient, opencodeSessionId: string): Promise<boolean> {
    try {
        const info = await client.session.get({ sessionID: opencodeSessionId })
        return Boolean(info)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/not ?found|404/i.test(message)) return false
        throw new DomainError(502, `Não foi possível falar com o OpenCode: ${message}`, "MADDOX_UNAVAILABLE")
    }
}

/** Remove a sessão do OpenCode (exclusão da sessão ou do cliente). Falha só vira log. */
export async function removeOpencodeSession(opencodeSessionId: string): Promise<void> {
    try {
        const client = await getOpencodeClient()
        await client.session.remove({ sessionID: opencodeSessionId })
    } catch (error) {
        log.warn({ opencodeSessionId, err: error instanceof Error ? error.message : error }, "[maddox] não foi possível remover a sessão do OpenCode")
    }
}

/** Interrompe a execução em andamento numa sessão do OpenCode (ex.: sessão órfã depois de reiniciar). */
export async function interruptOpencodeSession(opencodeSessionId: string): Promise<void> {
    try {
        const client = await getOpencodeClient()
        await client.session.interrupt({ sessionID: opencodeSessionId })
    } catch (error) {
        log.info({ opencodeSessionId, err: error instanceof Error ? error.message : error }, "[maddox] interrupção da sessão do OpenCode não confirmada")
    }
}
