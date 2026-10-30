"use client"

import { useEffect, useId, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Filter, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { ActiveFilterChip } from "./ActiveFilterChips"
import { CollapseToggle, CollapsedChips, CollapsibleBody } from "./CollapsibleFilters"
import { CadastroFilterCard } from "./CadastroFilterCard"
import { FilterGroup } from "./FilterGroup"

export type { ActiveFilterChip } from "./ActiveFilterChips"

export const SEARCH_DEBOUNCE_MS = 500

interface ListFiltersProps {
    /** Total de registros exibido no cabeçalho do cartão. */
    total?: number
    /** Busca compartilhada (omitir para páginas sem busca). */
    search?: {
        value: string
        onChange: (value: string) => void
        placeholder: string
        label?: string
    }
    /** Zera a busca e os filtros da página. */
    onClear: () => void
    /** Filtros próprios da página, cada um num `FilterGroup` (ex.: `className="flex-1 min-w-[180px]"`). */
    children?: ReactNode
    /**
     * Segunda linha de `FilterGroup`s (telas com muitos filtros, ex.: funil). Mesmo visual; evita
     * espremer tudo numa linha só no desktop.
     */
    secondary?: ReactNode
    /**
     * Cartão recolhível: começa recolhido (`defaultCollapsed`, padrão `true`) mostrando só o resumo
     * `chips`; clicar expande; o botão ⌃ recolhe.
     */
    collapsible?: boolean
    defaultCollapsed?: boolean
    /** Filtros ativos no resumo recolhido (ver `ActiveFilterChip`). */
    chips?: readonly ActiveFilterChip[]
}

/**
 * Wrapper genérico de filtros das listas (padrão do Smart Desk: `CadastroFilterCard` +
 * `FilterGroup`s em linha). A busca ocupa o espaço disponível (`flex-[2]`), os filtros da página
 * dividem o resto (`flex-1`) e o botão Limpar fecha a linha. No desktop tudo fica numa linha; no
 * celular quebra. O estado vive na página que o usa (URL ou navegador).
 *
 * Com `collapsible`, o cartão começa recolhido numa linha: título, chips dos filtros ativos
 * (removíveis), total, limpar e expandir. Abre/fecha animado (Framer Motion).
 */
export function ListFilters({ total, search, onClear, children, secondary, collapsible = false, defaultCollapsed = true, chips = [] }: ListFiltersProps) {
    const [localSearch, setLocalSearch] = useState(search?.value ?? "")
    const externalSearch = search?.value ?? ""
    const onSearchChange = search?.onChange
    const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed)
    const contentId = useId()

    // Acompanha mudanças externas (ex.: voltar no navegador, Limpar, remover chip).
    const [lastExternal, setLastExternal] = useState(externalSearch)
    if (lastExternal !== externalSearch) {
        setLastExternal(externalSearch)
        setLocalSearch(externalSearch)
    }

    useEffect(() => {
        if (!onSearchChange || localSearch === externalSearch) return
        const timer = setTimeout(() => onSearchChange(localSearch), SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [localSearch, externalSearch, onSearchChange])

    const clear = () => {
        setLocalSearch("")
        onClear()
    }

    const fields = (
        <>
            <div className="flex w-full flex-wrap items-end gap-3 lg:flex-nowrap">
                {search && (
                    <FilterGroup label={search.label ?? "Busca"} className="min-w-[200px] flex-[2]">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-50" aria-hidden />
                            <Input
                                aria-label={search.label ?? "Busca"}
                                placeholder={search.placeholder}
                                value={localSearch}
                                onChange={(event) => setLocalSearch(event.target.value)}
                                className="h-10 pl-9"
                            />
                        </div>
                    </FilterGroup>
                )}

                {children}

                <div className="shrink-0">
                    <div className="flex flex-col gap-2">
                        <span className="hidden select-none text-[10px] font-bold uppercase tracking-wider text-transparent lg:block">_</span>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 bg-transparent transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                            onClick={clear}
                            title="Limpar filtros"
                            aria-label="Limpar filtros"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>
            {secondary && <div className="mt-3 flex w-full flex-wrap items-end gap-3 lg:flex-nowrap">{secondary}</div>}
        </>
    )

    if (!collapsible) return <CadastroFilterCard total={total}>{fields}</CadastroFilterCard>

    const hasActive = chips.some((chip) => !chip.subtle)
    const expand = () => collapsed && setCollapsed(false)

    return (
        <TooltipProvider>
            <Card>
                <CardHeader className={cn("transition-[padding]", collapsed ? "py-3" : "pb-3")}>
                    <div
                        className={cn(
                            "grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 md:grid-cols-[auto_1fr_auto]",
                            collapsed && "cursor-pointer",
                        )}
                        onClick={expand}
                        data-testid="list-filters-header"
                    >
                        <div className="col-start-1 col-end-2 row-start-1 flex min-w-0 items-center gap-2">
                            <Filter className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                            <h2 className="whitespace-nowrap text-sm font-semibold uppercase tracking-wider text-muted-foreground">Filtros</h2>
                        </div>
                        <div className="col-start-1 col-end-3 row-start-2 min-w-0 md:col-start-2 md:col-end-3 md:row-start-1" data-testid="list-filters-summary">
                            <CollapsedChips collapsed={collapsed} chips={chips} />
                        </div>
                        <div className="col-start-2 col-end-3 row-start-1 flex shrink-0 items-center justify-end gap-1.5 md:col-start-3 md:col-end-4" data-testid="list-filters-controls">
                            {total !== undefined && total > 0 && (
                                <div className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{total} REGISTROS</div>
                            )}
                            <AnimatePresence initial={false}>
                                {collapsed && hasActive && (
                                    <motion.span key="clear" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }} className="inline-flex">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                clear()
                                            }}
                                            title="Limpar filtros"
                                            aria-label="Limpar filtros"
                                        >
                                            <X className="h-3.5 w-3.5" aria-hidden />
                                        </Button>
                                    </motion.span>
                                )}
                            </AnimatePresence>
                            <CollapseToggle collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} controls={contentId} />
                        </div>
                    </div>
                </CardHeader>
                {/* Popovers dos campos abrem em portal: o overflow não os corta. */}
                <CollapsibleBody collapsed={collapsed} id={contentId}>
                    <CardContent>{fields}</CardContent>
                </CollapsibleBody>
            </Card>
        </TooltipProvider>
    )
}
