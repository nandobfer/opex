"use client"

import { useCallback } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, FileUp, Info, Plus, RotateCw, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SEARCH_DEBOUNCE_MS } from "@/components/list/ListFilters"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { useDebouncedSearch } from "@/hooks/useDebouncedSearch"
import { useIsMobile } from "@/hooks/useMediaQuery"
import { MEMORY_HELP } from "../../help/identities"
import { NetworkFiltersBar } from "./NetworkFiltersBar"
import { NetworkFiltersSheet, type NetworkFilterFieldsProps } from "./NetworkFiltersSheet"
import { NETWORK_TOOLBAR_CLASS } from "./layout-classes"

export interface NetworkToolbarProps extends NetworkFilterFieldsProps {
    onClear: () => void
    /** Memórias que casam na visão atual (total do cartão de filtros). */
    total: number
    textOnly: boolean
    /** Falha da busca automática (mensagem pt-BR) ou `null`. */
    searchError?: string | null
    onRetrySearch?: () => void
    onNewChannel: () => void
    onImport: () => void
    importDisabled: boolean
}

/**
 * Barra da rede: Importar e Novo canal e, embaixo, a busca e os filtros no padrão de `/tarefas`
 * (`NetworkFiltersBar`, recolhível). A busca roda sozinha ao digitar; filtros destacam sem remover.
 */
export function NetworkToolbar(props: NetworkToolbarProps) {
    const mobile = useIsMobile()
    if (mobile) return <MobileToolbar {...props} />
    return (
        <div className="flex flex-col gap-2" data-testid="network-toolbar">
            <div className={NETWORK_TOOLBAR_CLASS}>
                <span className="ml-auto flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={props.onImport} disabled={props.importDisabled}>
                        <FileUp className="mr-1.5 h-4 w-4" aria-hidden /> Importar
                    </Button>
                    <Button type="button" onClick={props.onNewChannel}>
                        <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Novo canal
                    </Button>
                </span>
            </div>
            <NetworkFiltersBar filters={props.filters} onFilters={props.onFilters} options={props.options} onClear={props.onClear} total={props.total} />
            <SearchErrorNotice error={props.searchError ?? null} onRetry={props.onRetrySearch} />
            <TextOnlyNotice show={props.textOnly} />
        </div>
    )
}

/** Busca automática que falhou: a mensagem e "Tentar novamente" (nada fica destacado enquanto isso). */
function SearchErrorNotice({ error, onRetry }: { error: string | null; onRetry?: () => void }) {
    return (
        <AnimatePresence initial={false}>
            {error && (
                <motion.div key="search-error" role="alert" data-testid="network-search-error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap items-center gap-2 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Busca falhou: {error}
                    {onRetry && (
                        <Button type="button" variant="outline" size="sm" className="h-7 bg-transparent" onClick={onRetry}>
                            <RotateCw className="mr-1 h-3.5 w-3.5" aria-hidden /> Tentar novamente
                        </Button>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
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
 * Celular: a busca ocupa a linha inteira (roda sozinha ao digitar; o × limpa); embaixo, o botão
 * Filtros (gaveta com os mesmos campos) e Importar/Novo canal só com ícone e dica.
 */
function MobileToolbar(props: NetworkToolbarProps) {
    const { onFilters } = props
    const pushSearch = useCallback((value: string) => onFilters({ search: value }), [onFilters])
    const [search, setSearch] = useDebouncedSearch(props.filters.search, pushSearch, SEARCH_DEBOUNCE_MS)
    return (
        <div className="flex flex-col gap-2" data-testid="network-toolbar" data-mobile="">
            <div className="relative w-full">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar memórias" aria-label="Buscar memórias" className="h-10 bg-transparent pl-9 pr-10" />
                {search && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Limpar busca"
                        className="absolute right-0 top-0 h-10 w-10"
                        onClick={() => {
                            setSearch("")
                            props.onFilters({ search: "" })
                        }}
                    >
                        <X className="h-4 w-4" aria-hidden />
                    </Button>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <NetworkFiltersSheet filters={props.filters} onFilters={props.onFilters} options={props.options} onClear={props.onClear} />
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
            <SearchErrorNotice error={props.searchError ?? null} onRetry={props.onRetrySearch} />
        </div>
    )
}
