"use client"

import { AnimatePresence, motion } from "framer-motion"
import { FileUp, Info, Plus, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { MEMORY_HELP } from "../../help/identities"
import type { MemoryFilters } from "../../network/network-math"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { useIsMobile } from "@/hooks/useMediaQuery"
import { NetworkFilterFields, NetworkFiltersSheet } from "./NetworkFiltersSheet"
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
    const mobile = useIsMobile()
    if (mobile) return <MobileToolbar {...props} />
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
            <NetworkFilterFields filters={filters} onFilters={onFilters} channels={props.channels} categories={props.categories} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" />
            <TextOnlyNotice show={props.textOnly} />
        </div>
    )
}

function TextOnlyNotice({ show }: { show: boolean }) {
    return (
        <AnimatePresence initial={false}>
            {show && (
                <motion.p key="text-only" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-1.5 text-xs text-warning">
                    <Info className="h-3.5 w-3.5" aria-hidden /> Busca só textual. {MEMORY_HELP.textOnly}
                </motion.p>
            )}
        </AnimatePresence>
    )
}

/**
 * Celular: a busca ocupa a linha inteira (Buscar só com ícone); embaixo, Mostrar arquivados, o botão
 * Filtros (gaveta) e Importar/Novo canal só com ícone e dica.
 */
function MobileToolbar(props: NetworkToolbarProps) {
    return (
        <div className="flex flex-col gap-2" data-testid="network-toolbar" data-mobile="">
            <form
                className="flex w-full items-center gap-2"
                onSubmit={(event) => {
                    event.preventDefault()
                    props.onSearch()
                }}
            >
                <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input value={props.query} onChange={(event) => props.onQuery(event.target.value)} placeholder="Buscar memórias" aria-label="Buscar memórias" className="h-10 bg-transparent pl-9" />
                </div>
                <Button type="submit" variant="outline" size="icon" aria-label="Buscar" className="h-10 w-10 shrink-0 bg-transparent" disabled={props.searching || !props.query.trim()}>
                    <Search className="h-4 w-4" aria-hidden />
                </Button>
                {props.hasSearch && (
                    <Button type="button" variant="ghost" size="icon" aria-label="Limpar busca" className="h-10 w-10 shrink-0" onClick={props.onClearSearch}>
                        <X className="h-4 w-4" aria-hidden />
                    </Button>
                )}
            </form>
            <div className="flex flex-wrap items-center gap-2">
                <NetworkFiltersSheet filters={props.filters} onFilters={props.onFilters} channels={props.channels} categories={props.categories} />
                <span className="flex items-center gap-2 text-sm">
                    <Switch id="network-archived" checked={props.includeArchived} onCheckedChange={props.onIncludeArchived} />
                    <Label htmlFor="network-archived">Arquivados</Label>
                </span>
                <span className="ml-auto flex items-center gap-2">
                    <TooltipIconButton label="Importar" className="h-10 min-w-10 bg-transparent" disabledReason={props.importDisabled ? "Nenhum canal ativo para importar" : null} onClick={props.onImport}>
                        <FileUp aria-hidden />
                    </TooltipIconButton>
                    <TooltipIconButton label="Novo canal" className="h-10 min-w-10 bg-transparent" onClick={props.onNewChannel}>
                        <Plus aria-hidden />
                    </TooltipIconButton>
                </span>
            </div>
            <TextOnlyNotice show={props.textOnly} />
        </div>
    )
}
