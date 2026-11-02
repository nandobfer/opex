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
import { useAgentLabel } from "./AgentLabels"
import { AgentIcon } from "./agent-icons"
import { ChannelDisplayName } from "./ChannelName"

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

/**
 * Conteúdo do card que a partícula vira no clique ou toque: título, texto (rola dentro), chips
 * (categoria, canal legível, agente autor), idade, relevância, último uso e ações, sempre visíveis
 * embaixo. A forma, a posição e a transformação a partir da partícula ficam no `MemoryCardLayer` (fora
 * da camada com zoom); o conteúdo entra com fade quando a forma termina de crescer.
 */
export function MemoryCard({ memory, visual, actions, channelColor, contentDelay = 0 }: { memory: NetworkMemory; visual: ParticleVisual; actions: MemoryCardActions; channelColor?: string; contentDelay?: number }) {
    const active = memory.status !== "archived"
    const readOnly = actions.readOnly === true
    return (
        <motion.div data-testid="memory-card-body" className="flex h-full flex-col p-3 text-left" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.14, delay: contentDelay } }} exit={{ opacity: 0, transition: { duration: 0.08 } }}>
            <div className="flex shrink-0 items-start gap-2">
                <span aria-hidden className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: visual.baseColor }} />
                <p className="flex-1 text-sm font-semibold leading-snug">{memory.title}</p>
                {visual.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Fixada" />}
            </div>
            <p className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain whitespace-pre-wrap text-xs text-muted-foreground" data-testid="memory-card-text">
                {memory.text}
            </p>
            <div className="mt-2 flex shrink-0 flex-wrap items-center gap-1">
                <Badge variant="outline" className="text-[10px]">
                    {memory.category}
                </Badge>
                <Badge variant="outline" className="text-[10px]" style={channelColor ? { borderColor: channelColor } : undefined}>
                    <ChannelDisplayName slug={memory.channel} className="max-w-56" />
                </Badge>
                <AuthorChip memory={memory} />
                {memory.originLabel && (
                    <Badge variant="outline" className="text-[10px]" title={`Gravada por ${memory.originLabel}`} data-testid="memory-card-origin">
                        {memory.originLabel}
                    </Badge>
                )}
                {memory.fromOwner && (
                    <Badge variant="outline" className="text-[10px]">
                        Memória do dono
                    </Badge>
                )}
            </div>
            <dl className="mt-2 grid shrink-0 grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                <dt className="text-muted-foreground">Idade</dt>
                <dd data-testid="memory-card-age">{ago(memory.createdAt)}</dd>
                <dt className="text-muted-foreground">Relevância</dt>
                <dd data-testid="memory-card-uses">
                    {visual.uses} {visual.uses === 1 ? "uso" : "usos"} ({memory.retrievals} consultas · {memory.injections} injeções)
                </dd>
                <dt className="text-muted-foreground">Última vez usada</dt>
                <dd data-testid="memory-card-last-use">{visual.lastRealUse ? ago(visual.lastRealUse) : "nunca usada"}</dd>
            </dl>
            <div className="mt-3 flex shrink-0 items-center justify-between gap-2 border-t pt-2">
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

/**
 * Chip de quem criou a memória (OPE-113): o agente (ícone + nome sem "Agente", `app/agente` na dica) ou,
 * sem agente, o app que gravou. Sem autor (ou com a origem do Opex, que tem selo próprio), nada.
 */
function AuthorChip({ memory }: { memory: NetworkMemory }) {
    const agent = memory.authorAgent ?? null
    const name = useAgentLabel(agent ?? "")
    if (agent)
        return (
            <Badge variant="outline" className="gap-1 text-[10px]" title={`Criada pelo agente ${agent}`} data-testid="memory-card-author">
                <AgentIcon agent={agent} className="h-3 w-3" />
                <span className="max-w-40 truncate">{name}</span>
            </Badge>
        )
    if (memory.authorAgent === null && memory.author && !memory.originLabel)
        return (
            <Badge variant="outline" className="text-[10px]" title={`Criada pelo app ${memory.author}`} data-testid="memory-card-author">
                App {memory.author}
            </Badge>
        )
    return null
}

function CardAction({ label, onClick, disabled, destructive, children }: { label: string; onClick: () => void; disabled?: boolean; destructive?: boolean; children: React.ReactNode }) {
    return (
        <Button type="button" variant="ghost" size="icon" className={destructive ? "h-7 w-7 text-destructive hover:text-destructive" : "h-7 w-7"} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
            {children}
        </Button>
    )
}
