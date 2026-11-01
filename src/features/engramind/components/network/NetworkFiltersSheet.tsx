"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { MEMORY_STATUSES } from "../../constants"
import type { MemoryFilters } from "../../network/network-math"
import { FilterSelect } from "../shared/FilterSelect"

/** Quantos filtros da rede estão preenchidos (selo do botão Filtros no celular). */
export function activeFilterCount(filters: MemoryFilters): number {
    return [filters.channel, filters.status, filters.category, filters.author?.trim(), filters.since].filter(Boolean).length
}

/** Os cinco filtros da rede (destacam sem remover): em grade no computador, empilhados na gaveta do celular. */
export function NetworkFilterFields({ filters, onFilters, channels, categories, className }: { filters: MemoryFilters; onFilters: (next: MemoryFilters) => void; channels: readonly string[]; categories: readonly string[]; className?: string }) {
    return (
        <div className={className}>
            <FilterSelect id="net-channel" label="Canal" value={filters.channel} options={channels} onChange={(value) => onFilters({ ...filters, channel: value })} />
            <FilterSelect id="net-status" label="Status" value={filters.status} options={MEMORY_STATUSES} onChange={(value) => onFilters({ ...filters, status: value })} />
            <FilterSelect id="net-category" label="Categoria" value={filters.category} options={categories} onChange={(value) => onFilters({ ...filters, category: value })} />
            <Input aria-label="Autor" placeholder="Autor (app ou app/agente)" value={filters.author ?? ""} onChange={(event) => onFilters({ ...filters, author: event.target.value })} className="h-8 bg-transparent text-xs max-md:h-10" />
            <Input type="date" aria-label="Desde" value={filters.since ?? ""} onChange={(event) => onFilters({ ...filters, since: event.target.value })} className="h-8 bg-transparent text-xs max-md:h-10" />
        </div>
    )
}

/** Celular: botão "Filtros" (com quantos estão ativos) que abre os filtros numa gaveta de baixo para cima. */
export function NetworkFiltersSheet(props: { filters: MemoryFilters; onFilters: (next: MemoryFilters) => void; channels: readonly string[]; categories: readonly string[] }) {
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
                    <NetworkFilterFields {...props} className="mt-4 grid gap-3" />
                    <div className="mt-4 flex gap-2">
                        <Button type="button" variant="outline" className="h-10 flex-1 bg-transparent" disabled={!count} onClick={() => props.onFilters({})}>
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
