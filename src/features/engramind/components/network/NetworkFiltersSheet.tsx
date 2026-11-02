"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Archive, CircleDot, Hash, SlidersHorizontal, Tag, UserRound } from "lucide-react"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { FilterGroup } from "@/components/list/FilterGroup"
import { FilterSwitch } from "@/components/list/FilterSwitch"
import { Button } from "@/components/ui/button"
import { PresetDateRangeFilter } from "@/components/ui/preset-date-range-filter"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { activeNetworkFilterChips, MEMORY_STATUS_OPTIONS, type NetworkFilters } from "../../network/filters"

export interface NetworkFilterOptions {
    channels: readonly string[]
    categories: readonly string[]
    authors: readonly string[]
}

export interface NetworkFilterFieldsProps {
    filters: NetworkFilters
    onFilters: (patch: Partial<NetworkFilters>) => void
    options: NetworkFilterOptions
}

const COL = "min-w-[160px] flex-1"
const toOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }))

/** Quantos filtros da rede estão preenchidos (selo do botão Filtros no celular; a busca fica no campo). */
export function activeFilterCount(filters: NetworkFilters): number {
    return activeNetworkFilterChips(filters).filter((chip) => chip.key !== "search").length
}

/**
 * Filtros da rede com os componentes de `/tarefas` (destacam sem remover). `part`: a primeira linha
 * (Canal e Categoria, ao lado da busca), a segunda (Status, Autor, Período e Arquivados) ou todos
 * empilhados (gaveta do celular).
 */
export function NetworkFilterFields({ filters, onFilters, options, part = "all", groupClassName = COL }: NetworkFilterFieldsProps & { part?: "primary" | "secondary" | "all"; groupClassName?: string }) {
    const primary = (
        <>
            <FilterGroup label="Canal" className={groupClassName}>
                <CadastroMultiSelect icon={Hash} aria-label="Filtrar por canal" placeholder="Todos" options={toOptions(options.channels)} selected={filters.channels} onSelect={(channels) => onFilters({ channels })} searchable searchPlaceholder="Buscar canal..." />
            </FilterGroup>
            <FilterGroup label="Categoria" className={groupClassName}>
                <CadastroMultiSelect icon={Tag} aria-label="Filtrar por categoria" placeholder="Todas" options={toOptions(options.categories)} selected={filters.categories} onSelect={(categories) => onFilters({ categories })} searchable searchPlaceholder="Buscar categoria..." />
            </FilterGroup>
        </>
    )
    const secondary = (
        <>
            <FilterGroup label="Status" className={groupClassName}>
                <CadastroMultiSelect icon={CircleDot} aria-label="Filtrar por status" placeholder="Todos" options={MEMORY_STATUS_OPTIONS} selected={filters.statuses} onSelect={(statuses) => onFilters({ statuses })} />
            </FilterGroup>
            <FilterGroup label="Autor" className={groupClassName}>
                <CadastroMultiSelect icon={UserRound} aria-label="Filtrar por autor" placeholder="Todos" options={toOptions(options.authors)} selected={filters.authors} onSelect={(authors) => onFilters({ authors })} searchable searchPlaceholder="Buscar autor..." />
            </FilterGroup>
            <FilterGroup label="Período" className={groupClassName}>
                <PresetDateRangeFilter startDate={filters.from} endDate={filters.to} onChange={(next) => onFilters({ from: next.startDate, to: next.endDate })} />
            </FilterGroup>
            <FilterGroup label="Arquivados" className="shrink-0">
                <FilterSwitch icon={Archive} text="Mostrar" ariaLabel="Mostrar arquivados" checked={filters.includeArchived} onCheckedChange={(includeArchived) => onFilters({ includeArchived })} />
            </FilterGroup>
        </>
    )
    if (part === "primary") return primary
    if (part === "secondary") return secondary
    return (
        <>
            {primary}
            {secondary}
        </>
    )
}

/** Celular: botão "Filtros" (com quantos estão ativos) que abre os filtros numa gaveta de baixo para cima. */
export function NetworkFiltersSheet(props: NetworkFilterFieldsProps & { onClear: () => void }) {
    const [open, setOpen] = useState(false)
    const count = activeFilterCount(props.filters)
    return (
        <>
            <Button type="button" variant="outline" className="h-10 bg-transparent" onClick={() => setOpen(true)} aria-label={count ? `Filtros (${count} ${count === 1 ? "ativo" : "ativos"})` : "Filtros"}>
                <SlidersHorizontal className="mr-1.5 h-4 w-4" aria-hidden /> Filtros
                <AnimatePresence initial={false}>
                    {count > 0 && (
                        <motion.span
                            key="count"
                            data-testid="network-filter-count"
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.6 }}
                            transition={{ duration: 0.15 }}
                            className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground"
                        >
                            {count}
                        </motion.span>
                    )}
                </AnimatePresence>
            </Button>
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-xl">
                    <SheetHeader>
                        <SheetTitle>Filtros da rede</SheetTitle>
                        <SheetDescription>Destacam as memórias que combinam, sem remover as demais.</SheetDescription>
                    </SheetHeader>
                    <div className="mt-4 flex flex-col gap-3" data-testid="network-filters-sheet-fields">
                        <NetworkFilterFields filters={props.filters} onFilters={props.onFilters} options={props.options} groupClassName="w-full" />
                    </div>
                    <div className="mt-4 flex gap-2">
                        <Button type="button" variant="outline" className="h-10 flex-1 bg-transparent" disabled={!count} onClick={props.onClear}>
                            Limpar
                        </Button>
                        <Button type="button" className="h-10 flex-1" onClick={() => setOpen(false)}>
                            Ver rede
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>
        </>
    )
}
