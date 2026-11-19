"use client"

import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AlertTriangle } from "lucide-react"
import { TableAction } from "@/components/list/TableAction"
import { StatusPill } from "@/components/list/StatusPill"
import type { PluginDto } from "../types"
import { PluginScopeBadge, PluginVersionBadge } from "./PluginBadges"

/** Linha de um plugin: nome, escopo, versões estável e em prévia, estado e o erro de runtime. */
export function PluginRow({ plugin, onOpen }: { plugin: PluginDto; onOpen: () => void }) {
    return (
        <div className="flex flex-col gap-2 py-3 md:flex-row md:items-center" data-testid={`plugin-row-${plugin.id}`}>
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{plugin.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{plugin.id}</span>
                    <PluginScopeBadge scope={plugin.scope} clientName={plugin.clientName} />
                    {plugin.stable ? <PluginVersionBadge state="stable" number={plugin.stable.number} /> : <span className="text-xs text-muted-foreground">Sem versão estável</span>}
                    {plugin.preview && <PluginVersionBadge state="preview" number={plugin.preview.number} />}
                </div>
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
            <div className="flex items-center gap-2">
                <StatusPill active={plugin.active} activeLabel="Ativo" inactiveLabel="Desativado" />
                <TableAction type="visualize" onClick={onOpen} />
            </div>
        </div>
    )
}
