"use client"

import { useId, useState, type ReactNode } from "react"
import { Filter } from "lucide-react"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { ActiveFilterChip } from "@/components/list/ActiveFilterChips"
import { CollapseToggle, CollapsedChips, CollapsibleBody } from "@/components/list/CollapsibleFilters"
import { cn } from "@/lib/utils"

interface CollapsibleTaskFiltersProps {
    /** Filtros fora do padrão, mostrados no resumo recolhido. */
    chips: readonly ActiveFilterChip[]
    /** Filtros completos (estado expandido). */
    children: ReactNode
}

/**
 * Área de filtros recolhível da coluna Tarefas (mesmas peças do `ListFilters` de /tarefas, sem o
 * botão de limpar). Começa recolhida em duas linhas: "Filtros" + chevron e os chips numa linha só
 * (no máximo 2 + "+N"). Clicar no cabeçalho expande; o chevron alterna. O estado não é salvo.
 */
export function CollapsibleTaskFilters({ chips, children }: CollapsibleTaskFiltersProps) {
    const [collapsed, setCollapsed] = useState(true)
    const contentId = useId()

    return (
        <TooltipProvider>
            <div className={cn("space-y-1.5", collapsed && "cursor-pointer")} onClick={() => collapsed && setCollapsed(false)} data-testid="dev-center-filters-header">
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <h3 className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filtros</h3>
                    <CollapseToggle collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} controls={contentId} />
                </div>
                <CollapsedChips collapsed={collapsed} chips={chips} maxVisible={2} className="flex-nowrap overflow-hidden" />
            </div>
            {/* O padding evita cortar o anel de foco dos campos. */}
            <CollapsibleBody collapsed={collapsed} id={contentId} className="-mx-1 -mb-1 px-1">
                <div className="space-y-2 pb-1">{children}</div>
            </CollapsibleBody>
        </TooltipProvider>
    )
}
