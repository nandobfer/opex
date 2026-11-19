import { PluginPageHost } from "@/features/plugins/client/PluginPageHost"

/** Página coringa de plugin do cliente: `/cliente/x/{pluginId}/{...}` (só interface, OPE-172). */
export default async function ClientePluginPage({ params }: { params: Promise<{ path: string[] }> }) {
    const { path } = await params
    return <PluginPageHost segments={path} />
}
