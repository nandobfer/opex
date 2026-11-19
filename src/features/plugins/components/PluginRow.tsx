"use client"

import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AlertTriangle } from "lucide-react"
import { ItemNameLink } from "@/components/list/ItemNameLink"
import { TableAction } from "@/components/list/TableAction"
import { Skeleton } from "@/components/ui/skeleton"
import type { PluginDto } from "../types"
import { PluginActiveSwitch } from "./PluginActiveSwitch"
import { PluginArchivedBadge, PluginScopeBadge, PluginSlotBadges, PluginVersionBadge } from "./PluginBadges"

/**
 * Linha de um plugin: o nome leva à página dele; à direita, o debug (só o dono) e o switch Ativo,
 * como na lista de integrações.
 */
export function PluginRow({ plugin, href, onDebug }: { plugin: PluginDto; href: string; onDebug?: () => void }) {
    return (
        <div className="flex flex-col gap-2 py-3 md:flex-row md:items-center" data-testid={`plugin-row-${plugin.id}`}>
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <ItemNameLink href={href}>{plugin.name}</ItemNameLink>
                    <span className="font-mono text-xs text-muted-foreground">{plugin.id}</span>
                    <PluginScopeBadge scope={plugin.scope} clientName={plugin.clientName} />
                    {plugin.stable ? <PluginVersionBadge state="stable" number={plugin.stable.number} /> : <span className="text-xs text-muted-foreground">Sem versão estável</span>}
                    {plugin.preview && <PluginVersionBadge state="preview" number={plugin.preview.number} />}
                    {plugin.archivedAt && <PluginArchivedBadge />}
                </div>
                <PluginSlotBadges slots={plugin.slots} />
                <p className="text-xs text-muted-foreground">
                    {plugin.description || "Sem descrição"} · atualizado {formatDistanceToNow(new Date(plugin.updatedAt), { addSuffix: true, locale: ptBR })}
                </p>
                {plugin.runtimeError && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                        {plugin.runtimeError.channel === "preview" ? "Prévia" : "Estável"}: {plugin.runtimeError.message}
                    </p>
                )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
                {onDebug && <TableAction type="debug" onClick={onDebug} />}
                <PluginActiveSwitch pluginId={plugin.id} pluginName={plugin.name} active={plugin.active} archived={Boolean(plugin.archivedAt)} />
            </div>
        </div>
    )
}

/** Esqueleto da lista no formato da linha: nome e selos, descrição, debug e switch. */
export function PluginRowsSkeleton({ rows = 4, withDebug = true }: { rows?: number; withDebug?: boolean }) {
    return (
        <ul className="divide-y" data-testid="plugin-rows-skeleton">
            {Array.from({ length: rows }).map((_, index) => (
                <li key={index} className="flex flex-col gap-2 py-3 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="h-5 w-16 rounded-full" />
                            <Skeleton className="h-5 w-12 rounded-full" />
                        </div>
                        <div className="flex items-center gap-1">
                            <Skeleton className="h-5 w-24 rounded-full" />
                        </div>
                        <Skeleton className="h-3 w-64" />
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {withDebug && <Skeleton className="h-8 w-8 rounded-md" />}
                        <Skeleton className="h-6 w-11 rounded-full" />
                    </div>
                </li>
            ))}
        </ul>
    )
}
