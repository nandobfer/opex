"use client"

import { useEffect, useMemo, type ComponentType } from "react"
import { motion } from "framer-motion"
import { Skeleton } from "@/components/ui/skeleton"
import type { PluginRuntimeEntry } from "../types"
import { pluginExport } from "./loader"
import { PluginErrorBoundary, PluginErrorCard } from "./PluginErrorBoundary"
import { PluginHostProvider, type PluginHost } from "./sdk"
import { usePluginSource } from "./PluginSourceContext"
import { usePluginModule } from "./usePluginModule"
import { reportPluginClientError } from "./report-error"

/**
 * Uma contribuição de plugin montada (slot ou página): carrega o módulo da revisão, isola o erro e
 * entrega o `PluginHost` (axios do contexto, canal e versão). A `key` do chamador é a revisão: trocar
 * de versão (consolidação, prévia, rollback) desmonta a antiga e monta a nova, sem recarregar a página.
 */
export function PluginContribution({ entry, kind, exportName, props, skeletonClassName = "h-32" }: { entry: PluginRuntimeEntry; kind: "slots" | "pages"; exportName: string; props: object; skeletonClassName?: string }) {
    const source = usePluginSource()
    const loaded = usePluginModule(entry)
    const host = useMemo<PluginHost>(
        () => ({
            pluginId: entry.id,
            versionNumber: entry.versionNumber,
            channel: entry.channel,
            scope: source.kind,
            clientId: source.clientId,
            api: source.api,
            routeBase: source.kind === "owner" ? `/p/${entry.id}` : null,
            channel_: source.channel,
        }),
        [entry.id, entry.versionNumber, entry.channel, source],
    )

    const where = `${kind === "slots" ? "slot" : "página"} ${exportName}`
    const loadError = loaded.isError ? loaded.error : null
    useEffect(() => {
        if (loadError) reportPluginClientError(source, entry, loadError, `carregar o módulo (${where})`)
    }, [loadError, source, entry, where])

    if (loaded.isPending) return <Skeleton className={`w-full rounded-lg ${skeletonClassName}`} data-testid="plugin-loading" />
    if (loaded.isError) return <PluginErrorCard pluginName={entry.name} message={loaded.error instanceof Error ? loaded.error.message : String(loaded.error)} onRetry={() => void loaded.refetch()} />
    const Component = pluginExport(loaded.data, kind, exportName) as ComponentType<object> | null
    if (typeof Component !== "function" && !(Component && typeof Component === "object")) {
        return <PluginErrorCard pluginName={entry.name} message={`O plugin não exporta "${exportName}"`} />
    }

    return (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} data-plugin={entry.id} data-plugin-channel={entry.channel} data-plugin-version={entry.versionNumber} className="relative">
            {entry.channel === "preview" && <span className="absolute right-2 top-2 z-10 rounded-full border border-primary/40 bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">Prévia v{entry.versionNumber}</span>}
            <PluginErrorBoundary pluginName={entry.name} resetKey={entry.revision} onError={(error) => reportPluginClientError(source, entry, error, where)}>
                <PluginHostProvider host={host}>
                    <Component {...props} />
                </PluginHostProvider>
            </PluginErrorBoundary>
        </motion.div>
    )
}
