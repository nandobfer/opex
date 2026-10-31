"use client"

import Link from "next/link"
import { Archive, ArchiveRestore, ChevronRight, Pencil, Trash2 } from "lucide-react"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { CHANNEL_HELP } from "../../../help/identities"
import type { ChannelStats, EngramindChannel } from "../../../types"
import { route, useEngramindQuery } from "../../../hooks/useEngramind"
import { ENGRAMIND_PAGE_HREF } from "../../../constants"
import { HelpBadge } from "../../shared/Badges"
import { formatRelative } from "../../shared/format"

export type ChannelAction = "edit" | "archive" | "restore" | "delete"

/** Linha de canal com as estatísticas (`channel_stats`) e as ações. */
export function ChannelRow({ channel, onAction }: { channel: EngramindChannel; onAction: (action: ChannelAction, channel: EngramindChannel) => void }) {
    const stats = useEngramindQuery<ChannelStats>(route("channels", channel.slug, "stats"))
    const archived = Boolean(channel.archived_at)
    const memories = stats.data?.memories
    return (
        <div className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <Link href={`${ENGRAMIND_PAGE_HREF}/canais/${encodeURIComponent(channel.slug)}`} className="group min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 font-medium">
                    {channel.name}
                    <span className="font-mono text-xs text-muted-foreground">{channel.slug}</span>
                    {archived && <HelpBadge value="arquivado" tone="outline" help={CHANNEL_HELP.archived} />}
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </p>
                <p className="text-xs text-muted-foreground">
                    {memories ? `${memories.total} memória(s): ${memories.active} ativa(s), ${memories.permanent} fixada(s), ${memories.archived} arquivada(s)` : stats.isLoading ? "Carregando estatísticas…" : "Sem estatísticas"}
                    {stats.data && ` · ${stats.data.pending.title + stats.data.pending.embedding} pendente(s) · ${stats.data.retrievals} recuperação(ões) · última ${formatRelative(stats.data.last_memory_at)}`}
                    {` · prioridade ${channel.priority} · versão ${channel.version}`}
                </p>
            </Link>
            <TooltipIconButton label="Editar canal" onClick={() => onAction("edit", channel)}>
                <Pencil aria-hidden />
            </TooltipIconButton>
            {archived ? (
                <TooltipIconButton label="Restaurar canal" onClick={() => onAction("restore", channel)}>
                    <ArchiveRestore aria-hidden />
                </TooltipIconButton>
            ) : (
                <TooltipIconButton label="Arquivar canal" tooltip={CHANNEL_HELP.archived} onClick={() => onAction("archive", channel)}>
                    <Archive aria-hidden />
                </TooltipIconButton>
            )}
            <TooltipIconButton label="Excluir canal" onClick={() => onAction("delete", channel)} disabledReason={archived ? null : "Arquive o canal antes de excluir"}>
                <Trash2 aria-hidden />
            </TooltipIconButton>
        </div>
    )
}
