import { getOpencodeClient } from "@/lib/ai/opencode-client"
import type { MaddoxMcpStatusDto } from "../types"
import { ensureMaddoxMcp, maddoxDirectory, maddoxMcpStatus } from "./opencode-session"
import { loadMaddoxSettings } from "./settings"

/** Situação dos MCPs do Opex no OpenCode para a aba do Maddox; `reconnect` registra de novo antes de ler. */
export async function getMaddoxMcpStatus(options: { reconnect?: boolean } = {}): Promise<MaddoxMcpStatusDto> {
    const { settings } = await loadMaddoxSettings()
    try {
        if (options.reconnect) {
            const result = await ensureMaddoxMcp(await getOpencodeClient(), await maddoxDirectory(), settings.mcpBaseUrl, { force: true })
            if (!result.ok) return { baseUrl: settings.mcpBaseUrl, servers: [], error: result.error }
        }
        return { baseUrl: settings.mcpBaseUrl, servers: await maddoxMcpStatus(), error: null }
    } catch (error) {
        return { baseUrl: settings.mcpBaseUrl, servers: [], error: `Não foi possível falar com o OpenCode: ${error instanceof Error ? error.message : String(error)}` }
    }
}
