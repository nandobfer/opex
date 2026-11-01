"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCost, formatDuration } from "@/features/adversarial-agent/components/ReviewBadges"
import { ARCHITECT_DEPTH_DEFS, ARCHITECT_NODE_KIND_LABELS, ARCHITECT_NODE_KINDS, ARCHITECT_VIEW_LABELS, ARCHITECT_VIEWS, type ArchitectDepth, type ArchitectNodeKind, type ArchitectView } from "../../constants"
import type { GraphFilter } from "../../filters"
import type { ArchitectDiagramDto } from "../../types"

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

interface ArchitectToolbarProps {
    diagrams: readonly ArchitectDiagramDto[]
    diagram: ArchitectDiagramDto
    onSelect: (id: string) => void
    view: ArchitectView
    onViewChange: (view: ArchitectView) => void
    filter: GraphFilter
    onFilterChange: (filter: GraphFilter) => void
    children?: React.ReactNode
}

/** Barra da aba Arquitetura: versão, visão, filtros, exportação e os dados da versão. */
export function ArchitectToolbar({ diagrams, diagram, onSelect, view, onViewChange, filter, onFilterChange, children }: ArchitectToolbarProps) {
    const toggleKind = (kind: ArchitectNodeKind, checked: boolean) => onFilterChange({ ...filter, kinds: checked ? [...filter.kinds, kind] : filter.kinds.filter((item) => item !== kind) })
    const filtered = filter.onlyChanges || filter.kinds.length < ARCHITECT_NODE_KINDS.length
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <OptionTabs<ArchitectView> id="architect-view" aria-label="Visão do diagrama" options={ARCHITECT_VIEWS.map((value) => ({ value, label: ARCHITECT_VIEW_LABELS[value] }))} value={view} onChange={onViewChange} />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 bg-transparent" aria-label="Filtrar nós">
                            <Filter className="h-3.5 w-3.5" aria-hidden /> Filtros{filtered ? " (ativos)" : ""}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64">
                        <DropdownMenuCheckboxItem checked={filter.onlyChanges} onCheckedChange={(checked) => onFilterChange({ ...filter, onlyChanges: checked === true })} onSelect={(event) => event.preventDefault()}>
                            Só o que o plano cria/altera
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Tipos de nó</DropdownMenuLabel>
                        {ARCHITECT_NODE_KINDS.filter((kind) => kind !== "objective").map((kind) => (
                            <DropdownMenuCheckboxItem key={kind} checked={filter.kinds.includes(kind)} onCheckedChange={(checked) => toggleKind(kind, checked === true)} onSelect={(event) => event.preventDefault()}>
                                {ARCHITECT_NODE_KIND_LABELS[kind]}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <div className="ml-auto flex items-center gap-2">
                    <ArchitectVersionSelect diagrams={diagrams} diagram={diagram} onSelect={onSelect} />
                    {children}
                </div>
            </div>
            <p className="text-xs text-muted-foreground">
                {diagramVersionLabel(diagram)} · {ARCHITECT_DEPTH_DEFS[(diagram.depth as ArchitectDepth) ?? 3]?.label ?? `Nível ${diagram.depth}`} · gerada em {format(new Date(diagram.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                <span className="tabular-nums">
                    {" · "}
                    {formatCost(diagram.costUsd)} · {formatDuration(diagram.durationMs)}
                </span>
                {diagram.trimmed.nodes > 0 && ` · ${diagram.trimmed.nodes} nó(s) cortado(s) pelo teto do nível`}
            </p>
        </div>
    )
}
