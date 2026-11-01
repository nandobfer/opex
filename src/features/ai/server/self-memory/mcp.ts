import { timingSafeEqual } from "node:crypto"
import { deriveSubkey } from "@/lib/crypto/secretBox"
import { getOpencodeClient, type OpencodeClient } from "@/lib/ai/opencode-client"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { getLocalUser } from "@/lib/local-user"
import { loggerFor } from "@/lib/logger"
import { JSON_RPC_ERRORS, MCP_UNAUTHORIZED_CODE, OPENCODE_SESSION_META, handleMcpBody, mcpTextResult, type McpCallResult } from "@/features/maddox-agent/mcp-protocol"
import { toolErrorMessage } from "@/features/opex-agent/server/tools/define"
import { compactToolOutput } from "@/features/opex-agent/server/tool-display"
import { AI_AGENT_IDS, MEMORY_CONSUMER_DEFS } from "../../agents"
import { selfMemoryEnabled } from "./settings"
import { selfMemoryTools, type SelfMemoryContext } from "./tools"

/**
 * MCP "Memória própria" (OPE-104) para os agentes que rodam no OpenCode: Agente Maddox, agente
 * desenvolvedor (mesas e forks) e Agente Adversário. Um servidor só (`opex_memorias`), registrado por
 * diretório; o agente e o turno saem da sessão do OpenCode que chamou (`_meta["ai.opencode/sessionID"]`,
 * subindo até a sessão-mãe quando quem chama é um subagente): uma sessão desconhecida é recusada. A
 * autorização é o segredo derivado da chave das integrações (nada do Engramind passa pelo OpenCode).
 */

const log = loggerFor({ module: "ai", feature: "self-memory-mcp" })

export const AGENT_MEMORY_MCP_SERVER = "opex_memorias"
export const AGENT_MEMORY_MCP_PATH = "/api/agent-memory/mcp"
/** Prefixo dos nomes das ferramentas vistas pelo modelo no OpenCode. */
export const AGENT_MEMORY_MCP_TOOL_PREFIX = `${AGENT_MEMORY_MCP_SERVER}_`
const MAX_PARENT_DEPTH = 3

export function agentMemoryMcpSecret(): string | null {
    return deriveSubkey("agent-memory-mcp:v1")?.toString("base64url") ?? null
}

export function isAgentMemoryMcpAuthorized(authorization: string | null): boolean {
    const secret = agentMemoryMcpSecret()
    const received = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : ""
    if (!secret || !received) return false
    const a = Buffer.from(received)
    const b = Buffer.from(secret)
    return a.length === b.length && timingSafeEqual(a, b)
}

class SessionRefusal extends Error {}

type Resolver = (opencodeSessionId: string) => Promise<Omit<SelfMemoryContext, "onChange"> & { notify?: (message: string) => void } | null>

/** Sessão do OpenCode → agente e turno. Ordem: mesa, fork, revisão do Adversário, Agente Maddox. */
const resolvers: Resolver[] = [
    async (id) => {
        const { AgenticWorkbench } = await import("@/lib/db/models/Agentic")
        const doc = await AgenticWorkbench.findOne({ sessionId: id }).select({ _id: 1, centralId: 1, taskCode: 1, turnStartedAt: 1 }).lean()
        if (!doc) return null
        const workbenchId = String(doc._id)
        return {
            consumer: "desenvolvedor",
            turn: { kind: "central", centralId: doc.centralId },
            label: `${MEMORY_CONSUMER_DEFS.desenvolvedor.label} · ${doc.taskCode}`,
            turnKey: `wb:${workbenchId}:${doc.turnStartedAt ? new Date(doc.turnStartedAt).getTime() : 0}`,
            actorId: getLocalUser().id,
            auditContext: { mesa: workbenchId, tarefa: doc.taskCode },
            notify: (message) => void import("@/features/agentic/server/hub").then(({ publishWorkbenchEvent }) => publishWorkbenchEvent(workbenchId, { type: "notice", level: "info", message })),
        }
    },
    async (id) => {
        const { AgenticFork } = await import("@/lib/db/models/Agentic")
        const doc = await AgenticFork.findOne({ sessionId: id }).select({ _id: 1, centralId: 1, taskCode: 1, workbenchId: 1, number: 1, updatedAt: 1 }).lean<{ _id: unknown; centralId: string; taskCode: string; workbenchId: string; number: number }>()
        if (!doc) return null
        const forkId = String(doc._id)
        return {
            consumer: "desenvolvedor",
            turn: { kind: "central", centralId: doc.centralId },
            label: `${MEMORY_CONSUMER_DEFS.desenvolvedor.label} · ${doc.taskCode} (fork ${doc.number})`,
            turnKey: `fork:${forkId}:${Math.floor(Date.now() / 600_000)}`,
            actorId: getLocalUser().id,
            auditContext: { mesa: doc.workbenchId, fork: forkId, tarefa: doc.taskCode },
            notify: (message) => void import("@/features/agentic/server/hub").then(({ publishWorkbenchEvent }) => publishWorkbenchEvent(forkId, { type: "notice", level: "info", message })),
        }
    },
    async (id) => {
        const { AdversarialReview } = await import("@/features/adversarial-agent/server/models")
        const doc = await AdversarialReview.findOne({ sessionId: id }).lean<{ _id: unknown; workbenchId: string; taskCode?: string; round?: number }>()
        if (!doc) return null
        const reviewId = String(doc._id)
        return {
            consumer: "adversario",
            turn: { kind: "review" },
            label: `${MEMORY_CONSUMER_DEFS.adversario.label}${doc.taskCode ? ` · ${doc.taskCode}` : ""}`,
            turnKey: `adv:${reviewId}`,
            actorId: getLocalUser().id,
            auditContext: { mesa: doc.workbenchId, revisao: reviewId, ...(doc.taskCode ? { tarefa: doc.taskCode } : {}) },
            notify: (message) => void import("@/features/agentic/server/hub").then(({ publishWorkbenchEvent }) => publishWorkbenchEvent(doc.workbenchId, { type: "notice", level: "info", message })),
        }
    },
    async (id) => {
        const { OpexSession } = await import("@/lib/db/models/Opex")
        const session = await OpexSession.findOne({ opencodeSessionId: id, agent: "maddox" }).lean()
        if (!session) return null
        const { actorIdOf, sessionScopeOf } = await import("@/features/opex-agent/server/scope")
        const scope = await sessionScopeOf(session)
        const sessionId = String(session._id)
        return {
            consumer: "maddox",
            turn: scope.kind === "client" ? { kind: "client", clientId: String(scope.actor.client._id) } : { kind: "owner" },
            label: scope.kind === "client" ? `${MEMORY_CONSUMER_DEFS.maddox.label} · ${scope.actor.client.name}` : MEMORY_CONSUMER_DEFS.maddox.label,
            turnKey: `maddox:${sessionId}:${session.nextSeq ?? 0}`,
            actorId: actorIdOf(scope),
            auditContext: { sessao: sessionId },
        }
    },
]

/** Contexto da chamada a partir da sessão do OpenCode (ou da sessão-mãe). */
export async function selfMemoryContextOfSession(opencodeSessionId: string): Promise<SelfMemoryContext | null> {
    const { dbConnect } = await import("@/lib/db")
    await dbConnect()
    let current: string | null = opencodeSessionId
    for (let depth = 0; current && depth <= MAX_PARENT_DEPTH; depth++) {
        for (const resolve of resolvers) {
            const found = await resolve(current)
            if (found) {
                const { notify, ...context } = found
                return { ...context, ...(notify ? { onChange: notify } : {}) }
            }
        }
        const client = await getOpencodeClient()
        const info: { parentID?: string | null } | null = await client.session.get({ sessionID: current }).catch(() => null)
        current = info?.parentID ?? null
    }
    return null
}

/** Descritores do `tools/list` (todas as listas; a validação real é por turno, no `tools/call`). */
function listingTools() {
    return selfMemoryTools({ consumer: "desenvolvedor", turn: { kind: "owner" }, label: "", turnKey: "listing", actorId: "" }, [...AI_AGENT_IDS])
}

export async function callSelfMemoryTool(name: string, args: Record<string, unknown>, meta: Record<string, unknown>): Promise<McpCallResult> {
    const startedAt = Date.now()
    try {
        const sessionId = typeof meta[OPENCODE_SESSION_META] === "string" ? (meta[OPENCODE_SESSION_META] as string) : null
        if (!sessionId) throw new SessionRefusal("Chamada sem a sessão do OpenCode: as memórias só atendem um agente do Opex.")
        const context = await selfMemoryContextOfSession(sessionId)
        if (!context) throw new SessionRefusal("Esta sessão do OpenCode não é de um agente do Opex (mesa, fork, revisão do Adversário ou Agente Maddox).")
        if (!(await selfMemoryEnabled(context.consumer))) throw new SessionRefusal(`O aprendizado autônomo do ${MEMORY_CONSUMER_DEFS[context.consumer].label} está desligado.`)
        const tool = selfMemoryTools(context).find((item) => item.name === name)
        if (!tool) return mcpTextResult(`Ferramenta desconhecida: ${name}`, true)
        const output = await tool.execute(tool.input.parse(args), { sessionId: "", actorId: context.actorId })
        log.info({ tool: name, consumer: context.consumer, durationMs: Date.now() - startedAt, ok: true }, "[ai] memória própria do agente")
        return mcpTextResult(compactToolOutput(output))
    } catch (error) {
        const message = error instanceof SessionRefusal ? error.message : toolErrorMessage(error)
        log.info({ tool: name, durationMs: Date.now() - startedAt, ok: false, err: message }, "[ai] memória própria do agente falhou")
        return mcpTextResult(message, true)
    }
}

const rpcError = (status: number, code: number, message: string) => Response.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status })

/** POST do transporte MCP (sem estado): autentica pelo segredo derivado e responde JSON. */
export async function handleAgentMemoryMcpRequest(req: Request): Promise<Response> {
    if (!isAgentMemoryMcpAuthorized(req.headers.get("authorization"))) {
        log.warn("[ai] chamada ao MCP de memórias sem autorização")
        return rpcError(401, MCP_UNAUTHORIZED_CODE, "Não autorizado")
    }
    let body: unknown
    try {
        body = await req.json()
    } catch {
        return rpcError(400, JSON_RPC_ERRORS.parse, "JSON inválido")
    }
    const { toolDescriptor } = await import("@/features/maddox-agent/server/mcp-catalog")
    const result = await handleMcpBody(body, {
        listTools: () => listingTools().map(toolDescriptor),
        callTool: (name, args, meta) => callSelfMemoryTool(name, args, meta),
    })
    if (result === null) return new Response(null, { status: 202 })
    return Response.json(result)
}

/** URL que o OpenCode alcança: a pública do Opex da integração Engramind (ou a do MCP do Maddox). */
async function mcpBaseUrl(): Promise<string | null> {
    const config = await getIntegrationConfig("engramind").catch(() => null)
    if (config?.opexPublicUrl) return config.opexPublicUrl.replace(/\/+$/, "")
    const { loadMaddoxSettings } = await import("@/features/maddox-agent/server/settings")
    return (await loadMaddoxSettings().catch(() => null))?.settings.mcpBaseUrl ?? null
}

const globalRegistry = globalThis as unknown as { __agentMemoryMcpRegistered?: Set<string> }
const registered = (globalRegistry.__agentMemoryMcpRegistered ??= new Set())

/**
 * Registra o MCP de memórias no OpenCode para os diretórios da sessão (uma vez por processo e
 * diretório). Nunca lança: falha vira `{ ok: false }` e o turno segue sem as ferramentas.
 */
export async function ensureAgentMemoryMcp(client: OpencodeClient, directories: readonly (string | null | undefined)[]): Promise<{ ok: boolean; error: string | null }> {
    try {
        const base = await mcpBaseUrl()
        if (!base) return { ok: false, error: "configure a URL pública do Opex (integração Engramind › Conexão)" }
        const secret = agentMemoryMcpSecret()
        if (!secret) return { ok: false, error: "defina INTEGRATIONS_ENCRYPTION_KEY" }
        const url = `${base}${AGENT_MEMORY_MCP_PATH}`
        for (const directory of [...new Set(directories.filter((item): item is string => Boolean(item)))]) {
            const key = `${directory}|${url}`
            const location = { location: { directory } }
            const present = new Set(
                await client.mcp
                    .list(location)
                    .then((result) => result.data.map((server) => server.name))
                    .catch(() => [] as string[]),
            )
            if (registered.has(key) && present.has(AGENT_MEMORY_MCP_SERVER)) continue
            if (present.has(AGENT_MEMORY_MCP_SERVER)) await client.mcp.remove({ server: AGENT_MEMORY_MCP_SERVER, ...location }).catch(() => undefined)
            await client.mcp.add({ server: AGENT_MEMORY_MCP_SERVER, ...location, config: { type: "remote", url, headers: { Authorization: `Bearer ${secret}` }, oauth: false, timeout: { execution: 120_000 } } })
            registered.add(key)
        }
        return { ok: true, error: null }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.warn({ err: message }, "[ai] não foi possível registrar o MCP de memórias no OpenCode")
        return { ok: false, error: message }
    }
}
