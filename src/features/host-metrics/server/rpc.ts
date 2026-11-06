import { getOpencodeClient } from "@/lib/ai/opencode-client"
import { getOpencodeConnection } from "@/lib/ai/opencode"
import { HTOP_PLUGIN_ID, HTOP_RPC_ID, HTOP_RPC_METHOD, HTOP_RPC_TIMEOUT_MS } from "../constants"

/**
 * Plugin `opencode-htop` no `opencode serve`: detecção por `plugin.list()` (ativo e com RPC) e a
 * chamada `opencode-htop.stats`, o mesmo canal da TUI (sem processo no host).
 */

/** O plugin está carregado, ativo e expõe RPC. */
export type HtopPluginDetector = () => Promise<boolean>
/** Saída crua do RPC (validada pelo serviço); lança em qualquer falha. */
export type HtopRpcCaller = () => Promise<unknown>

interface PluginEntry {
    id?: string
    source?: { type?: string; target?: string; path?: string }
    features?: { rpc?: true }
    state?: { status?: string }
}

/** O plugin `opencode-htop` (pelo id ou pelo pacote/caminho) aparece ativo e com RPC na lista. */
export function isHtopPluginActive(plugins: readonly PluginEntry[]): boolean {
    return plugins.some((plugin) => {
        const names = [plugin.id, plugin.source?.target, plugin.source?.path].filter((name): name is string => typeof name === "string")
        const matches = names.some((name) => name === HTOP_PLUGIN_ID || name.includes(HTOP_PLUGIN_ID))
        return matches && plugin.features?.rpc === true && plugin.state?.status === "active"
    })
}

export const detectHtopPlugin: HtopPluginDetector = async () => {
    const connection = await getOpencodeConnection()
    const client = await getOpencodeClient(connection)
    const result = await client.plugin.list(connection.directory ? { location: { directory: connection.directory } } : {})
    return isHtopPluginActive(result.data)
}

export const callHtopRpc: HtopRpcCaller = async () => {
    const connection = await getOpencodeConnection()
    const client = await getOpencodeClient(connection)
    const result = await client.rpc.call(
        { rpcID: HTOP_RPC_ID, method: HTOP_RPC_METHOD, input: {}, ...(connection.directory ? { location: { directory: connection.directory } } : {}) },
        { signal: AbortSignal.timeout(HTOP_RPC_TIMEOUT_MS) },
    )
    return result.output
}
