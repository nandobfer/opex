import type { OpencodeClient } from "@/lib/ai/opencode-client"
import { memoriesSection, memoryCacheNotice } from "@/features/ai/memories-prompt"
import { selfMemoryInstructions } from "@/features/ai/self-memory"
import { logger } from "@/lib/logger"
import { DEVELOPER_MEMORIES_INSTRUCTIONS_KEY } from "../constants"

/**
 * Memórias do agente desenvolvedor (OPE-97; Engramind desde a OPE-104): o contexto do Engramind
 * (Memórias do Opex, globais e da central) vira uma entrada durável de instrução da sessão do
 * OpenCode, regravada a cada turno da mesa e do fork — assim a memória criada, editada ou excluída
 * vale a partir do próximo turno. Com o aprendizado autônomo ligado, o MCP "Memória própria" é
 * registrado nos diretórios da sessão e a instrução dele entra junto (diretório que ainda não existe,
 * como o worktree antes de o agente de implementação criá-lo, é pulado sem aviso; quando a sessão
 * muda para ele, `registerDeveloperMemoryMcpAt` registra o MCP lá). Sem memórias nem aprendizado,
 * a entrada sai da sessão. Se o servidor recusar a gravação, quem chamou prefixa `section` no prompt.
 */

export interface DeveloperMemoriesSync {
    /** `true` quando a sessão já tem as memórias atuais (ou não há memórias). */
    applied: boolean
    /** Seção das memórias para o prompt (vazia sem memórias). */
    section: string
}

export interface DeveloperMemoriesOptions {
    /** Diretórios da sessão (central e worktree) onde o MCP de memórias é registrado. */
    directories?: readonly (string | null | undefined)[]
    /** Aviso discreto na Saída da IA (contexto do cache, aprendizado indisponível). */
    notify?: (level: "info" | "warn", message: string) => void
}

/** Prefixo das ferramentas do MCP "Memória própria" no OpenCode. */
const SELF_MEMORY_TOOL_PREFIX = "opex_memorias_"

async function selfMemorySection(client: OpencodeClient, centralId: string, options: DeveloperMemoriesOptions): Promise<string> {
    const { selfMemoryEnabled } = await import("@/features/ai/server/self-memory/settings")
    if (!(await selfMemoryEnabled("desenvolvedor"))) return ""
    const { ensureAgentMemoryMcp } = await import("@/features/ai/server/self-memory/mcp")
    const registered = await ensureAgentMemoryMcp(client, options.directories ?? [])
    if (!registered.ok) {
        options.notify?.("warn", `Aprendizado autônomo indisponível neste turno: ${registered.error}`)
        return ""
    }
    return selfMemoryInstructions("desenvolvedor", { kind: "central", centralId }, { toolPrefix: SELF_MEMORY_TOOL_PREFIX }).trim()
}

export async function syncDeveloperMemories(client: OpencodeClient, sessionId: string, centralId: string, options: DeveloperMemoriesOptions = {}): Promise<DeveloperMemoriesSync> {
    // Import sob demanda: mantém o Engramind e o banco fora do carregamento do workflow.
    let block = ""
    let self = ""
    try {
        const { developerMemoryContext } = await import("@/features/ai/server/agent-memory-context")
        const context = await developerMemoryContext(centralId)
        block = context.block
        const notice = memoryCacheNotice(context)
        if (notice) options.notify?.("warn", notice)
        self = await selfMemorySection(client, centralId, options)
    } catch (error) {
        // Falha inesperada não derruba o turno: a sessão mantém a última versão gravada.
        logger.warn({ err: error, sessionId, centralId }, "[agentic] não foi possível ler as memórias do agente desenvolvedor; o turno segue com as já gravadas na sessão")
        return { applied: true, section: "" }
    }
    const section = [memoriesSection(block).trim(), self].filter(Boolean).join("\n\n")
    if (!section) {
        try {
            await client.session.instructions.entry.remove({ sessionID: sessionId, key: DEVELOPER_MEMORIES_INSTRUCTIONS_KEY })
        } catch {
            // Sessão sem a entrada (ou servidor sem suporte): nada a remover.
        }
        return { applied: true, section: "" }
    }
    try {
        await client.session.instructions.entry.put({ sessionID: sessionId, key: DEVELOPER_MEMORIES_INSTRUCTIONS_KEY, value: section })
        return { applied: true, section }
    } catch (error) {
        logger.warn({ err: error, sessionId, centralId }, "[agentic] não foi possível gravar as memórias do agente desenvolvedor na sessão; vão no prompt do turno")
        return { applied: false, section }
    }
}

/**
 * A sessão da mesa mudou de diretório no meio do turno (o agente criou o worktree e moveu a sessão):
 * com o aprendizado autônomo ligado, o MCP de memórias passa a valer também no diretório novo.
 * Nunca lança e nunca avisa na mesa (o próximo turno registra de novo).
 */
export async function registerDeveloperMemoryMcpAt(client: OpencodeClient | (() => Promise<OpencodeClient>), directory: string): Promise<void> {
    try {
        const { selfMemoryEnabled } = await import("@/features/ai/server/self-memory/settings")
        if (!(await selfMemoryEnabled("desenvolvedor"))) return
        const { ensureAgentMemoryMcp } = await import("@/features/ai/server/self-memory/mcp")
        const registered = await ensureAgentMemoryMcp(typeof client === "function" ? await client() : client, [directory])
        if (!registered.ok) logger.warn({ directory, err: registered.error }, "[agentic] MCP de memórias não registrado no novo diretório da sessão")
    } catch (error) {
        logger.warn({ err: error, directory }, "[agentic] falha ao registrar o MCP de memórias no novo diretório da sessão")
    }
}

/** Prompt do turno com as memórias à frente quando a sessão não as recebeu como instrução. */
export function withDeveloperMemories(sync: DeveloperMemoriesSync, text: string): string {
    return sync.applied || !sync.section ? text : `${sync.section}\n\n---\n${text}`
}
