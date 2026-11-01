"use client"

import { AnimatePresence, motion } from "framer-motion"
import { FileUp, Info, Plus, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { MEMORY_STATUSES } from "../../constants"
import { MEMORY_HELP } from "../../help/identities"
import type { MemoryFilters } from "../../network/network-math"
import { FilterSelect } from "../shared/FilterSelect"
import { NETWORK_TOOLBAR_CLASS } from "./layout-classes"

export interface NetworkToolbarProps {
    filters: MemoryFilters
    onFilters: (next: MemoryFilters) => void
    channels: readonly string[]
    categories: readonly string[]
    query: string
    onQuery: (value: string) => void
    onSearch: () => void
    onClearSearch: () => void
    searching: boolean
    hasSearch: boolean
    textOnly: boolean
    includeArchived: boolean
    onIncludeArchived: (value: boolean) => void
    onNewChannel: () => void
    onImport: () => void
    importDisabled: boolean
}

/** Barra da rede: Novo canal, Importar, busca, filtros (destacam sem remover) e Mostrar arquivados. */
export function NetworkToolbar(props: NetworkToolbarProps) {
    const { filters, onFilters } = props
    return (
        <div className="flex flex-col gap-2" data-testid="network-toolbar">
            <div className={NETWORK_TOOLBAR_CLASS}>
                <form
                    className="flex min-w-64 flex-1 items-center gap-2"
                    onSubmit={(event) => {
                        event.preventDefault()
                        props.onSearch()
                    }}
                >
                    <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input value={props.query} onChange={(event) => props.onQuery(event.target.value)} placeholder="Buscar por sentido e por texto" aria-label="Buscar memórias" className="bg-transparent pl-9" />
                    </div>
                    <Button type="submit" variant="outline" className="bg-transparent" disabled={props.searching || !props.query.trim()}>
                        Buscar
                    </Button>
                    {props.hasSearch && (
                        <Button type="button" variant="ghost" onClick={props.onClearSearch}>
                            <X className="mr-1 h-4 w-4" aria-hidden /> Limpar busca
                        </Button>
                    )}
                </form>
                <span className="flex items-center gap-2 text-sm">
                    <Switch id="network-archived" checked={props.includeArchived} onCheckedChange={props.onIncludeArchived} />
                    <Label htmlFor="network-archived">Mostrar arquivados</Label>
                </span>
                <span className="ml-auto flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={props.onImport} disabled={props.importDisabled}>
                        <FileUp className="mr-1.5 h-4 w-4" aria-hidden /> Importar
                    </Button>
                    <Button type="button" onClick={props.onNewChannel}>
                        <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Novo canal
                    </Button>
                </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <FilterSelect id="net-channel" label="Canal" value={filters.channel} options={props.channels} onChange={(value) => onFilters({ ...filters, channel: value })} />
                <FilterSelect id="net-status" label="Status" value={filters.status} options={MEMORY_STATUSES} onChange={(value) => onFilters({ ...filters, status: value })} />
                <FilterSelect id="net-category" label="Categoria" value={filters.category} options={props.categories} onChange={(value) => onFilters({ ...filters, category: value })} />
                <Input aria-label="Autor" placeholder="Autor (app ou app/agente)" value={filters.author ?? ""} onChange={(event) => onFilters({ ...filters, author: event.target.value })} className="h-8 bg-transparent text-xs" />
                <Input type="date" aria-label="Desde" value={filters.since ?? ""} onChange={(event) => onFilters({ ...filters, since: event.target.value })} className="h-8 bg-transparent text-xs" />
            </div>
            <AnimatePresence initial={false}>
                {props.textOnly && (
                    <motion.p key="text-only" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-1.5 text-xs text-warning">
                        <Info className="h-3.5 w-3.5" aria-hidden /> Busca só textual. {MEMORY_HELP.textOnly}
                    </motion.p>
                )}
            </AnimatePresence>
        </div>
    )
}
