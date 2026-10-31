"use client"

import { Archive, ArchiveRestore, ArrowRightLeft, History, Pin, PinOff, Trash2 } from "lucide-react"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { MEMORY_HELP } from "../../../help/identities"
import type { EngramindMemory } from "../../../types"
import { HelpBadge, toneOf } from "../../shared/Badges"
import { formatDateTime } from "../../shared/format"

export type MemoryAction = "history" | "pin" | "unpin" | "archive" | "restore" | "move" | "delete"

/** Uma memória: título, texto, categoria, status, autor e as ações. */
export function MemoryRow({ memory, onAction }: { memory: EngramindMemory; onAction: (action: MemoryAction, memory: EngramindMemory) => void }) {
    const archived = memory.status === "archived"
    const author = memory.author.agent ? `${memory.author.app}/${memory.author.agent}` : (memory.author.app ?? "—")
    return (
        <div className="flex flex-wrap items-start gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{memory.title ?? "(sem título)"}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{memory.id}</span>
                    <HelpBadge value={memory.status} tone={toneOf(memory.status)} help={MEMORY_HELP.status} />
                    <HelpBadge value={memory.category} />
                    {memory.title_state !== "ready" && <HelpBadge value={`título ${memory.title_state}`} help={MEMORY_HELP.title_state} />}
                    {memory.embedding_state !== "ready" && <HelpBadge value={`vetor ${memory.embedding_state}`} help={MEMORY_HELP.embedding_state} />}
                </p>
                <p className="line-clamp-3 whitespace-pre-wrap text-foreground/90">{memory.text}</p>
                <p className="text-xs text-muted-foreground">
                    {memory.channel} · v{memory.version} · {author} · {formatDateTime(memory.updated_at)}
                </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
                <TooltipIconButton label="Histórico de versões" tooltip={MEMORY_HELP.version} onClick={() => onAction("history", memory)}>
                    <History aria-hidden />
                </TooltipIconButton>
                {memory.status === "permanent" ? (
                    <TooltipIconButton label="Desafixar" onClick={() => onAction("unpin", memory)}>
                        <PinOff aria-hidden />
                    </TooltipIconButton>
                ) : (
                    <TooltipIconButton label="Fixar" onClick={() => onAction("pin", memory)} disabledReason={archived ? "Restaure antes de fixar" : null}>
                        <Pin aria-hidden />
                    </TooltipIconButton>
                )}
                {archived ? (
                    <TooltipIconButton label="Restaurar" onClick={() => onAction("restore", memory)}>
                        <ArchiveRestore aria-hidden />
                    </TooltipIconButton>
                ) : (
                    <TooltipIconButton label="Arquivar" onClick={() => onAction("archive", memory)}>
                        <Archive aria-hidden />
                    </TooltipIconButton>
                )}
                <TooltipIconButton label="Mover de canal" onClick={() => onAction("move", memory)}>
                    <ArrowRightLeft aria-hidden />
                </TooltipIconButton>
                <TooltipIconButton label="Excluir de vez" onClick={() => onAction("delete", memory)}>
                    <Trash2 aria-hidden />
                </TooltipIconButton>
            </div>
        </div>
    )
}
