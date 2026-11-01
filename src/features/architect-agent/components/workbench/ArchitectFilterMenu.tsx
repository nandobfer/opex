"use client"

import { Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ARCHITECT_NODE_KIND_LABELS, ARCHITECT_NODE_KINDS, type ArchitectNodeKind } from "../../constants"
import type { GraphFilter } from "../../filters"
import { CANVAS_TOOL_BUTTON_CLASS } from "./ArchitectCanvasToolbar"

/** Filtros do diagrama (só o que o plano cria/altera e tipos de nó), na barra dentro do canvas. */
export function ArchitectFilterMenu({ filter, onFilterChange }: { filter: GraphFilter; onFilterChange: (filter: GraphFilter) => void }) {
    const toggleKind = (kind: ArchitectNodeKind, checked: boolean) => onFilterChange({ ...filter, kinds: checked ? [...filter.kinds, kind] : filter.kinds.filter((item) => item !== kind) })
    const filtered = filter.onlyChanges || filter.kinds.length < ARCHITECT_NODE_KINDS.length
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className={CANVAS_TOOL_BUTTON_CLASS} aria-label="Filtrar nós">
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
    )
}
