import type { NextRequest } from "next/server"
import type { PluginChannel } from "../constants"
import { loadedPluginFiber } from "./kernel/kernel"
import { findPluginRoute } from "./kernel/registries"
import { pluginLog } from "./logs"
import { previewListFromRequest } from "./preview-cookie"

/**
 * Despacho da rota coringa `/api/p/{pluginId}/...` (OPE-172). A prévia vale quando o navegador está
 * com a prévia do plugin ligada E a fiber de prévia existe; senão, a stable. `found: false` = sem rota.
 */
export async function dispatchPluginRoute(req: NextRequest, pluginId: string, segments: string[]): Promise<{ found: false } | { found: true; result: unknown }> {
    const path = `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`
    const previewOn = previewListFromRequest(req).includes(pluginId) && (await loadedPluginFiber(pluginId, "preview")) !== null
    const channel: PluginChannel = previewOn ? "preview" : "stable"
    const route = findPluginRoute(pluginId, req.method, path, channel)
    if (!route) return { found: false }
    try {
        return { found: true, result: await route.entry.handler({ req, params: route.params, path }) }
    } catch (error) {
        pluginLog(pluginId, "error", `Rota ${req.method} ${path} falhou`, { error: error instanceof Error ? error.message : String(error) }, channel)
        throw error
    }
}
