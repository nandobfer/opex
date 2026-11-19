"use client"

import { useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, ArrowLeft, Blocks, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorCode, apiErrorMessage } from "@/lib/api"
import { usePluginSource } from "../client/PluginSourceContext"
import { useApprovePluginPreview, usePlugin, usePluginsRealtime, useSetPluginActive } from "../hooks/usePlugins"
import { PluginScopeBadge, PluginVersionBadge } from "./PluginBadges"
import { PluginDiffCard } from "./PluginDiffCard"
import { PluginPreviewToggle } from "./PluginPreviewToggle"
import { PluginRuntimeCard } from "./PluginRuntimeCard"
import { PluginVersionsCard } from "./PluginVersionsCard"

/** Detalhe de um plugin: estado, prévia, versões, diferença entre versões e runtime (dono). */
export function PluginDetailView({ id, backHref }: { id: string; backHref: string }) {
    usePluginsRealtime()
    const source = usePluginSource()
    const query = usePlugin(id)
    const active = useSetPluginActive(id)
    const approve = useApprovePluginPreview(id)
    const [selected, setSelected] = useState<string | null>(null)
    const [confirmOff, setConfirmOff] = useState(false)

    if (query.isPending) return <PluginDetailSkeleton />
    if (query.isError) {
        if (apiErrorCode(query.error) === "PLUGIN_NOT_FOUND") return <EmptyState icon={Blocks} title="Plugin não encontrado" description="Ele pode ter sido removido ou ser de outro cliente." />
        return <ErrorState title="Não foi possível carregar o plugin" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    }
    const plugin = query.data
    const diffTarget = selected ?? plugin.preview?.id ?? plugin.stable?.id ?? plugin.versions[0]?.id ?? null

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
                    <div className="ml-auto flex items-center gap-2">
                        <label htmlFor={`plugin-active-${plugin.id}`} className="text-xs text-muted-foreground">
                            Ativo
                        </label>
                        <Switch id={`plugin-active-${plugin.id}`} checked={plugin.active} disabled={active.isPending} onCheckedChange={(checked) => (checked ? active.mutate(true) : setConfirmOff(true))} />
                    </div>
                </div>
                {plugin.description && <p className="text-sm text-muted-foreground">{plugin.description}</p>}
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
                {plugin.preview && (
                    <motion.div key="preview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                        <Card>
                            <CardContent className="flex flex-wrap items-center gap-3 pt-6">
                                <p className="mr-auto text-sm">
                                    Versão <span className="font-mono">v{plugin.preview.number}</span> em prévia: só aparece para quem ligar a prévia neste navegador.
                                </p>
                                <PluginPreviewToggle pluginId={plugin.id} />
                                {source.kind === "client" && plugin.previewWorkbenchId && (
                                    <Button type="button" size="sm" onClick={() => approve.mutate()} disabled={approve.isPending}>
                                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                        Aprovar prévia
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            {plugin.versions.length === 0 ? (
                <EmptyState icon={Blocks} title="Nenhuma versão ainda" description="A primeira versão nasce na mesa da tarefa do tipo Plugin." />
            ) : (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                    <div className="space-y-6">
                        <PluginVersionsCard plugin={plugin} selectedId={diffTarget} onSelect={setSelected} showTaskLinks={source.kind === "owner"} />
                        {source.kind === "owner" && plugin.scope === "owner" && <PluginRuntimeCard pluginId={plugin.id} />}
                    </div>
                    {diffTarget && <PluginDiffCard key={diffTarget} pluginId={plugin.id} toVersionId={diffTarget} />}
                </div>
            )}

            <ConfirmDialog
                open={confirmOff}
                onOpenChange={setConfirmOff}
                title="Desativar o plugin?"
                description="O plugin sai das telas na hora e, no dono, as rotas, ferramentas e crons dele são desfeitos. Você pode reativar depois."
                confirmLabel="Desativar"
                variant="destructive"
                pending={active.isPending}
                onConfirm={() => active.mutate(false, { onSettled: () => setConfirmOff(false) })}
            />
        </div>
    )
}

/** Esqueleto no formato do detalhe (cabeçalho, versões e diferença lado a lado). */
export function PluginDetailSkeleton() {
    return (
        <div className="flex flex-col gap-6" data-testid="plugin-detail-skeleton">
            <div className="space-y-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-8 w-64" />
            </div>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <Skeleton className="h-64 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
            </div>
        </div>
    )
}
