import { PluginPageHost } from "@/features/plugins/client/PluginPageHost"

/** Página coringa de plugin do dono: `/x/{pluginId}/{...}` (OPE-172). */
export default async function PluginPage({ params }: { params: Promise<{ path: string[] }> }) {
    const { path } = await params
    return <PluginPageHost segments={path} />
}
