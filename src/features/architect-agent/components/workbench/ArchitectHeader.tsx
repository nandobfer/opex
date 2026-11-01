"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ChevronDown, StickyNote } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCost, formatDuration } from "@/features/adversarial-agent/components/ReviewBadges"
import { ARCHITECT_DEPTH_DEFS, ARCHITECT_NOTE_KIND_LABELS, type ArchitectDepth } from "../../constants"
import type { ArchitectGraph, ArchitectNote } from "../../graph"
import type { ArchitectDiagramDto } from "../../types"

/**
 * Cabeçalho compacto da aba Arquitetura (duas linhas finas, para o canvas ficar com o resto da altura):
 * título com o resumo num ícone de dica e o seletor de versão à direita; dados da versão com
 * "Decisões, riscos e dúvidas" alinhado à direita, abrindo num popover ancorado ao próprio botão.
 */

/** Classes do cabeçalho (o skeleton usa as mesmas). */
export const ARCHITECT_HEADER_CLASS = "flex flex-col gap-1"
export const ARCHITECT_HEADER_ROW_CLASS = "flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1"

/** Rótulo de uma versão: "Plano v2 · arquitetura v1". */
export const diagramVersionLabel = (diagram: Pick<ArchitectDiagramDto, "planVersion" | "planSeq">) => `Plano v${diagram.planVersion} · arquitetura v${diagram.planSeq}`

/** Seletor de versão (só com mais de uma), com "(atual)" na mais recente. */
export function ArchitectVersionSelect({ diagrams, diagram, onSelect }: { diagrams: readonly ArchitectDiagramDto[]; diagram: ArchitectDiagramDto; onSelect: (id: string) => void }) {
    const latest = diagrams.at(-1)
    if (diagrams.length < 2 || !latest) return null
    return (
        <Select value={diagram.id} onValueChange={(value) => value && onSelect(value)}>
            <SelectTrigger className="h-8 w-60" aria-label="Versão da arquitetura">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {[...diagrams].reverse().map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                        {diagramVersionLabel(item)}
                        {item.id === latest.id ? " (atual)" : ""}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

/** "Decisões, riscos e dúvidas (N)": popover ancorado ao botão, alinhado à borda direita dele. */
export function ArchitectNotesButton({ notes }: { notes: readonly ArchitectNote[] }) {
    const [open, setOpen] = useState(false)
    if (!notes.length) return null
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="ml-auto h-7 gap-1.5 px-2 text-xs" aria-expanded={open} data-testid="architect-notes-trigger">
                    <StickyNote className="h-3.5 w-3.5" aria-hidden /> Decisões, riscos e dúvidas ({notes.length})
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" collisionPadding={8} className="max-h-[min(24rem,var(--radix-popover-content-available-height))] w-[min(28rem,calc(100vw-1rem))] overflow-y-auto p-3">
                <ul className="space-y-2" aria-label="Decisões, riscos e dúvidas">
                    {notes.map((note, index) => (
                        <li key={index} className="flex items-start gap-2 text-xs">
                            <Badge variant={note.kind === "risk" ? "destructive" : "outline"} className="shrink-0 text-[10px]">
                                {ARCHITECT_NOTE_KIND_LABELS[note.kind]}
                            </Badge>
                            <span className="text-muted-foreground">{note.text}</span>
                        </li>
                    ))}
                </ul>
            </PopoverContent>
        </Popover>
    )
}

interface ArchitectHeaderProps {
    diagrams: readonly ArchitectDiagramDto[]
    diagram: ArchitectDiagramDto
    graph: ArchitectGraph
    onSelect: (id: string) => void
    showNotes: boolean
}

export function ArchitectHeader({ diagrams, diagram, graph, onSelect, showNotes }: ArchitectHeaderProps) {
    return (
        <div className={ARCHITECT_HEADER_CLASS} data-testid="architect-header">
            <div className={ARCHITECT_HEADER_ROW_CLASS}>
                <p className="min-w-0 truncate text-sm font-medium">{graph.title || "Desenhando a arquitetura do plano…"}</p>
                {graph.summary && <InfoTooltip text={graph.summary} label="o diagrama" side="bottom" contentClassName="max-h-80 max-w-md overflow-y-auto" />}
                <div className="ml-auto">
                    <ArchitectVersionSelect diagrams={diagrams} diagram={diagram} onSelect={onSelect} />
                </div>
            </div>
            <div className={ARCHITECT_HEADER_ROW_CLASS} data-testid="architect-meta-row">
                <p className="text-xs text-muted-foreground">
                    {diagramVersionLabel(diagram)} · {ARCHITECT_DEPTH_DEFS[(diagram.depth as ArchitectDepth) ?? 3]?.label ?? `Nível ${diagram.depth}`} · gerada em {format(new Date(diagram.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    <span className="tabular-nums">
                        {" · "}
                        {formatCost(diagram.costUsd)} · {formatDuration(diagram.durationMs)}
                    </span>
                    {diagram.trimmed.nodes > 0 && ` · ${diagram.trimmed.nodes} nó(s) cortado(s) pelo teto do nível`}
                </p>
                {showNotes && <ArchitectNotesButton notes={graph.notes} />}
            </div>
        </div>
    )
}
