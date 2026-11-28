"use client"

import { useId, useRef, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, ArrowLeft, Blocks, Bug } from "lucide-react"
import { ACTIVE_ITEM_ROW_SKELETON_CLASS } from "@/components/list/ActiveItemRow"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorCode, apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { DebugConsoleCloseButton } from "@nandobfer/integracoes/react"
import { DebugLogsPanel } from "@nandobfer/integracoes/react"
import { DebugToggleIconButton } from "@nandobfer/integracoes/react"
import { DEBUG_DIALOG_MEDIA_QUERY } from "@nandobfer/integracoes/react"
import { useLogsMaximized } from "@nandobfer/integracoes/react"
import { useScrollViewportHeight } from "@nandobfer/integracoes/react"
import { usePluginSource } from "../client/PluginSourceContext"
import { usePlugin, usePluginsRealtime } from "../hooks/usePlugins"
import { PluginActiveSwitch } from "./PluginActiveSwitch"
import { PluginArchivedBadge, PluginScopeBadge, PluginSlotBadges, PluginVersionBadge } from "./PluginBadges"
import { PluginArchiveButton } from "./PluginArchiveButton"
import { PluginRuntimeCard } from "./PluginRuntimeCard"
import { PluginVersionsCard } from "./PluginVersionsCard"
import { PluginDebugConsole } from "./debug/PluginDebugConsole"
import { PluginDebugDialog } from "./debug/PluginDebugDialog"

/**
 * Detalhe de um plugin (OPE-172): cabeçalho com o debug (só o dono) e o switch Ativo; Versões (a em uso,
 * a prévia com Ver/Aprovar e o descritivo de cada mudança) e o runtime no servidor (plugin do dono).
 * O debug abre a coluna de logs à direita, como na página da integração (na tela estreita, o modal).
 */
export function PluginDetailView({ id, backHref }: { id: string; backHref: string }) {
    usePluginsRealtime()
    const source = usePluginSource()
    const query = usePlugin(id)
    const owner = source.kind === "owner"
    const gridRef = useRef<HTMLDivElement>(null)
    const [debugOpen, setDebugOpen] = useState(false)
    const narrow = useMediaQuery(DEBUG_DIALOG_MEDIA_QUERY)
    const columnOpen = owner && debugOpen && !narrow
    const panelId = useId()
    const debugHeight = useScrollViewportHeight(gridRef, columnOpen)
    const { logsCardRef, logsMaximized, setLogsMaximized } = useLogsMaximized(columnOpen)

    if (query.isPending) return <PluginDetailSkeleton />
    if (query.isError) {
        if (apiErrorCode(query.error) === "PLUGIN_NOT_FOUND") return <EmptyState icon={Blocks} title="Plugin não encontrado" description="Ele pode ter sido removido ou ser de outro cliente." />
        return <ErrorState title="Não foi possível carregar o plugin" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    }
    const plugin = query.data

    return (
        <div className="flex flex-col gap-6">
            <div className="space-y-3">
                <Link href={backHref} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Plugins
                </Link>
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-lg font-semibold md:text-2xl">{plugin.name}</h1>
                    <span className="font-mono text-xs text-muted-foreground">{plugin.id}</span>
                    <PluginScopeBadge scope={plugin.scope} clientName={plugin.clientName} />
                    {plugin.stable && <PluginVersionBadge state="stable" number={plugin.stable.number} />}
                    {plugin.preview && <PluginVersionBadge state="preview" number={plugin.preview.number} />}
                    {plugin.archivedAt && <PluginArchivedBadge />}
                    <div className="ml-auto flex items-center gap-2">
                        {owner && <DebugToggleIconButton open={debugOpen} onToggle={() => setDebugOpen((open) => !open)} panelId={panelId} className="shrink-0" />}
                        <PluginArchiveButton pluginId={plugin.id} pluginName={plugin.name} archived={Boolean(plugin.archivedAt)} />
                        <PluginActiveSwitch pluginId={plugin.id} pluginName={plugin.name} active={plugin.active} archived={Boolean(plugin.archivedAt)} showLabel />
                    </div>
                </div>
                {plugin.description && <p className="text-sm text-muted-foreground">{plugin.description}</p>}
                <PluginSlotBadges slots={plugin.slots} />
            </div>

            <AnimatePresence initial={false}>
                {plugin.runtimeError && (
                    <motion.div key="runtime-error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                        <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" aria-hidden />
                        <span>
                            {plugin.runtimeError.channel === "preview" ? "A prévia" : "A versão estável"} não ativou no servidor: {plugin.runtimeError.message}. A versão anterior continua.
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            <div ref={gridRef} className={cn("grid items-start gap-6", columnOpen && "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
                <div className="min-w-0 space-y-6">
                    {plugin.versions.length === 0 ? (
                        <EmptyState icon={Blocks} title="Nenhuma versão ainda" description="A primeira versão nasce na mesa da tarefa do tipo Plugin." />
                    ) : (
                        <PluginVersionsCard plugin={plugin} showTaskLinks={owner} canGenerateSummary={owner} />
                    )}
                    {owner && plugin.scope === "owner" && <PluginRuntimeCard pluginId={plugin.id} />}
                </div>
                {owner && (
                    <DebugLogsPanel visible={columnOpen} debugHeight={debugHeight} logsCardRef={logsCardRef} panelId={panelId} testId="plugin-debug-panel">
                        <PluginDebugConsole
                            pluginId={plugin.id}
                            className="flex-1"
                            consoleClassName="min-h-0 flex-1"
                            maximized={logsMaximized}
                            onMaximizedChange={setLogsMaximized}
                            actions={<DebugConsoleCloseButton onClick={() => setDebugOpen(false)} />}
                            title={
                                <h2 className="flex items-center gap-2 text-base font-semibold">
                                    <Bug className="h-4 w-4 text-amber-600" /> Logs
                                </h2>
                            }
                        />
                    </DebugLogsPanel>
                )}
            </div>
            {owner && <PluginDebugDialog plugin={debugOpen && narrow ? { id: plugin.id, name: plugin.name } : null} onOpenChange={(open) => !open && setDebugOpen(false)} />}
        </div>
    )
}

/** Esqueleto no formato do detalhe: cabeçalho e as linhas de Versões no tamanho do `ActiveItemRow`. */
export function PluginDetailSkeleton() {
    return (
        <div className="flex flex-col gap-6" data-testid="plugin-detail-skeleton">
            <div className="space-y-3">
                <Skeleton className="h-3 w-16" />
                <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="ml-auto h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-6 w-20" />
                </div>
                <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <div className="space-y-2 rounded-xl border p-6">
                <Skeleton className="mb-4 h-5 w-24" />
                {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className={ACTIVE_ITEM_ROW_SKELETON_CLASS} />
                ))}
            </div>
        </div>
    )
}
