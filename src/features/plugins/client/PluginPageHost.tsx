"use client"

import { Puzzle } from "lucide-react"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { Skeleton } from "@/components/ui/skeleton"
import { usePluginRuntime, usePluginsRealtime } from "../hooks/usePlugins"
import { PluginContribution } from "./PluginContribution"

/**
 * Página coringa de plugin (`/x/{pluginId}/{...}` no dono e `/cliente/x/...` no portal): casa o
 * caminho com `pages` do manifesto da versão vigente e monta o componente (client component; Server
 * Components não carregam em runtime).
 */
export function PluginPageHost({ segments }: { segments: string[] }) {
    usePluginsRealtime()
    const runtime = usePluginRuntime()
    const [pluginId, ...rest] = segments
    const path = rest.join("/")
    if (runtime.isPending) return <Skeleton className="h-64 w-full rounded-lg" data-testid="plugin-page-loading" />
    if (runtime.isError) return <ErrorState title="Não foi possível carregar os plugins" description="Tente novamente em instantes." onRetry={() => void runtime.refetch()} />
    const entry = runtime.data.plugins.find((item) => item.id === pluginId)
    const page = entry?.pages.find((item) => item.path === path) ?? (path === "" ? entry?.pages[0] : undefined)
    if (!entry || !page) return <EmptyState icon={Puzzle} title="Página de plugin não encontrada" description="O plugin pode estar desativado ou não ter esta página." />
    return (
        <div className="space-y-4">
            <h1 className="text-xl font-semibold text-foreground">{page.title}</h1>
            <PluginContribution key={`${entry.id}:${page.path}:${entry.revision}`} entry={entry} kind="pages" exportName={page.export} props={{}} skeletonClassName="h-64" />
        </div>
    )
}
