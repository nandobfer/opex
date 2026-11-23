import mongoose from "mongoose"
import { deriveSubkey } from "@/lib/crypto/secretBox"
import type { OpencodeClient } from "@/lib/ai/opencode-client"
import { logger } from "@/lib/logger"
import type { RemoteMcpRegistration } from "@/features/ai/server/opencode-mcp"
import { WORKBENCH_MCP_PATH, WORKBENCH_MCP_SERVER } from "../../workbench-context"

/**
 * Registro do MCP "Mesa do Opex" no OpenCode (OPE-178). Módulo leve (sem as ferramentas nem o Storage):
 * roda em todo turno da mesa e do fork.
 */

export function workbenchMcpSecret(): string | null {
    return deriveSubkey("agentic-workbench-mcp:v1")?.toString("base64url") ?? null
}

/**
 * Registra o MCP da mesa nos diretórios da sessão (a mesma URL pública do Opex usada pelo MCP de
 * memórias). Nunca lança: sem URL, sem chave ou com falha, `ok: false` e o turno segue com os dados da
 * mesa no prompt.
 */
export async function ensureWorkbenchMcp(client: OpencodeClient, directories: readonly (string | null | undefined)[]): Promise<RemoteMcpRegistration> {
    try {
        // A URL pública vem da configuração das integrações (banco): sem conexão, o turno não espera por ela.
        if (mongoose.connection.readyState !== 1) return { ok: false, error: "banco de dados não conectado", skipped: [] }
        const { opexPublicBaseUrl } = await import("@/features/ai/server/self-memory/mcp")
        const base = await opexPublicBaseUrl()
        if (!base) return { ok: false, error: "configure a URL pública do Opex (integração Engramind › Conexão)", skipped: [] }
        const secret = workbenchMcpSecret()
        if (!secret) return { ok: false, error: "defina INTEGRATIONS_ENCRYPTION_KEY", skipped: [] }
        const { ensureRemoteMcp } = await import("@/features/ai/server/opencode-mcp")
        return await ensureRemoteMcp(client, { server: WORKBENCH_MCP_SERVER, url: `${base}${WORKBENCH_MCP_PATH}`, secret, label: "MCP da mesa" }, directories)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.warn({ err: message }, "[agentic] não foi possível registrar o MCP da mesa no OpenCode")
        return { ok: false, error: message, skipped: [] }
    }
}

/** A sessão mudou de diretório (worktree criado): o MCP da mesa passa a valer lá também. Nunca lança. */
export async function registerWorkbenchMcpAt(client: OpencodeClient | (() => Promise<OpencodeClient>), directory: string): Promise<void> {
    try {
        await ensureWorkbenchMcp(typeof client === "function" ? await client() : client, [directory])
    } catch {
        // O próximo turno registra de novo.
    }
}
