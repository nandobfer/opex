"use client"

import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { motion } from "framer-motion"
import { ArrowRightLeft, History, Pencil, Pin, PinOff, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { ParticleVisual } from "../../network/particles"
import type { NetworkMemory } from "../../network/types"

/** Ações do card da memória; a origem dos dados (Engramind bruto ou listas dos agentes) decide como gravar. */
export interface MemoryCardActions {
    onActive: (memory: NetworkMemory, active: boolean) => void
    onPin: (memory: NetworkMemory, pinned: boolean) => void
    onEdit: (memory: NetworkMemory) => void
    onDelete: (memory: NetworkMemory) => void
    onMove?: (memory: NetworkMemory) => void
    onHistory?: (memory: NetworkMemory) => void
    /** Somente leitura (ex.: canal arquivado). */
    readOnly?: boolean
}

export const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR })

/** Card que a partícula vira no hover ou toque: título, texto, idade, relevância, último uso e ações. */
export function MemoryCard({ memory, visual, actions, channelColor }: { memory: NetworkMemory; visual: ParticleVisual; actions: MemoryCardActions; channelColor?: string }) {
    const active = memory.status !== "archived"
    const readOnly = actions.readOnly === true
    return (
        <motion.div
            role="dialog"
            aria-label={`Memória ${memory.title}`}
            data-testid={`memory-card-${memory.id}`}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.16 }}
            className="nodrag nopan nowheel absolute left-full top-1/2 z-50 ml-3 w-72 -translate-y-1/2 cursor-default rounded-xl border bg-popover p-3 text-left text-popover-foreground shadow-xl"
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
        >
            <div className="flex items-start gap-2">
                <span aria-hidden className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: visual.ageColor }} />
                <p className="flex-1 text-sm font-semibold leading-snug">{memory.title}</p>
                {visual.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Fixada" />}
            </div>
            <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground" data-testid="memory-card-text">
                {memory.text}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1">
                <Badge variant="outline" className="text-[10px]">
                    {memory.category}
                </Badge>
                <Badge variant="outline" className="text-[10px]" style={channelColor ? { borderColor: channelColor } : undefined}>
                    {memory.channel}
                </Badge>
                {memory.fromOwner && (
                    <Badge variant="outline" className="text-[10px]">
                        Memória do dono
                    </Badge>
                )}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                <dt className="text-muted-foreground">Idade</dt>
                <dd data-testid="memory-card-age">{ago(memory.createdAt)}</dd>
                <dt className="text-muted-foreground">Relevância</dt>
                <dd data-testid="memory-card-uses">
                    {visual.uses} {visual.uses === 1 ? "uso" : "usos"} ({memory.retrievals} consultas · {memory.injections} injeções)
                </dd>
                <dt className="text-muted-foreground">Última vez usada</dt>
                <dd data-testid="memory-card-last-use">{visual.lastRealUse ? ago(visual.lastRealUse) : "nunca usada"}</dd>
            </dl>
            <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2">
                <span className="flex items-center gap-2">
                    <Switch id={`active-${memory.id}`} checked={active} disabled={readOnly} onCheckedChange={(checked) => actions.onActive(memory, checked)} />
                    <Label htmlFor={`active-${memory.id}`} className="text-xs">
                        Ativa
                    </Label>
                </span>
                <span className="flex items-center gap-0.5">
                    <CardAction label={visual.pinned ? "Desafixar" : "Fixar"} disabled={readOnly || !active} onClick={() => actions.onPin(memory, !visual.pinned)}>
                        {visual.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    </CardAction>
                    <CardAction label="Editar" disabled={readOnly} onClick={() => actions.onEdit(memory)}>
                        <Pencil className="h-3.5 w-3.5" />
                    </CardAction>
                    {actions.onMove && (
                        <CardAction label="Mover de canal" disabled={readOnly} onClick={() => actions.onMove?.(memory)}>
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                        </CardAction>
                    )}
                    {actions.onHistory && (
                        <CardAction label="Histórico" onClick={() => actions.onHistory?.(memory)}>
                            <History className="h-3.5 w-3.5" />
                        </CardAction>
                    )}
                    <CardAction label="Excluir" destructive disabled={readOnly} onClick={() => actions.onDelete(memory)}>
                        <Trash2 className="h-3.5 w-3.5" />
                    </CardAction>
                </span>
            </div>
        </motion.div>
    )
}

function CardAction({ label, onClick, disabled, destructive, children }: { label: string; onClick: () => void; disabled?: boolean; destructive?: boolean; children: React.ReactNode }) {
    return (
        <Button type="button" variant="ghost" size="icon" className={destructive ? "h-7 w-7 text-destructive hover:text-destructive" : "h-7 w-7"} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
            {children}
        </Button>
    )
}
