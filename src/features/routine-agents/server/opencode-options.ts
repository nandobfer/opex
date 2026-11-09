import type { RoutineOpencodeOptionsDto } from "../types"
import { messageOf } from "./shared"

/**
 * MCPs do host (motor OpenCode, OPE-130): os do `opencode.jsonc` com o status atual, e se há um MCP de
 * navegador habilitado (nome ou URL com playwright/browser/chrome/puppeteer). Skills (OPE-153, D8): as
 * globais ligadas e as nativas, pela MESMA listagem da aba Skills do OpenCode (`listResources`, escopo global).
 */

const BROWSER = /playwright|browser|chrome|chromium|puppeteer|navegador/i

export const isBrowserMcp = (name: string) => BROWSER.test(name)

export async function routineOpencodeOptions(): Promise<RoutineOpencodeOptionsDto> {
    try {
        const { getOpencodeClient } = await import("@/lib/ai/opencode-client")
        const { getOpencodeConnection } = await import("@/lib/ai/opencode")
        const connection = await getOpencodeConnection()
        const client = await getOpencodeClient(connection)
        const result = await client.mcp.list(connection.directory ? { location: { directory: connection.directory } } : {})
        const { listResources } = await import("@/features/opencode-resources/server/service")
        const skills = (await listResources("skill", "global"))
            .filter((skill) => skill.enabled)
            .map((skill) => ({ name: skill.name, description: skill.description ?? "", native: skill.builtin }))
        const mcps = result.data
            .filter((server) => !server.name.startsWith("rotina_"))
            .map((server) => ({ name: server.name, status: (server.status as { status?: string } | undefined)?.status ?? "unknown", browser: isBrowserMcp(server.name) }))
        return { available: true, reason: null, mcps, skills, browserAvailable: mcps.some((server) => server.browser && server.status === "connected") }
    } catch (error) {
        return { available: false, reason: `Serviço OpenCode indisponível: ${messageOf(error)}`, mcps: [], skills: [], browserAvailable: false }
    }
}
