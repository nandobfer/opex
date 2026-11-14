"use client"

import { useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Filter, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SheetClose } from "@/components/ui/sheet"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/list/ActiveFilterChips"
import { mobileFilterChips, seeTasksLabel } from "../../../dev-center-mobile"
import { ActionSheet } from "../../workbench/mobile/ActionSheet"
import { TASKS_MOBILE_HEADER_CLASS, TASKS_MOBILE_ICON_BUTTON_CLASS, TASKS_MOBILE_SEARCH_CLASS, TASKS_MOBILE_TITLE_ROW_CLASS } from "./header-classes"
import { QuotaSheetButton } from "./QuotaSheetButton"

interface TasksMobileHeaderProps {
    /** Tarefas na lista filtrada. */
    count: number
    /** Chips dos filtros fora do padrão (a busca sai daqui: tem campo próprio). */
    chips: readonly ActiveFilterChip[]
    search: string
    onSearch: (value: string) => void
    /** Botão de configurar a central (o mesmo do desktop, em 40 px). */
    settings: ReactNode
    /** Filtros completos (os mesmos componentes do desktop), na folha "Filtros". */
    filters: ReactNode
}

/**
 * Topo da coluna Tarefas no celular (`< lg`, OPE-166): "Tarefas N" com Quota, Filtros (selo com o número
 * de filtros fora do padrão) e Configurar; a busca sempre à vista; e os chips dos filtros ativos numa linha
 * que rola, só quando há algum. Filtros e quota abrem em folhas de baixo, liberando a altura para a lista.
 */
export function TasksMobileHeader({ count, chips, search, onSearch, settings, filters }: TasksMobileHeaderProps) {
    const [filtersOpen, setFiltersOpen] = useState(false)
    const visibleChips = mobileFilterChips(chips)
    const active = visibleChips.length
    return (
        <div className={TASKS_MOBILE_HEADER_CLASS} data-testid="tasks-mobile-header">
            <div className={TASKS_MOBILE_TITLE_ROW_CLASS}>
                <h2 className="flex-1 text-sm font-semibold">
                    Tarefas <span className="font-mono text-xs font-normal text-muted-foreground">{count}</span>
                </h2>
                <QuotaSheetButton />
                <Button type="button" variant="ghost" size="icon" className={cn("relative", TASKS_MOBILE_ICON_BUTTON_CLASS)} onClick={() => setFiltersOpen(true)} aria-label={active ? `Filtros (${active} ${active === 1 ? "ativo" : "ativos"})` : "Filtros"} data-testid="dev-center-filters-button">
                    <Filter className="h-4 w-4" aria-hidden />
                    <AnimatePresence initial={false}>
                        {active > 0 && (
                            <motion.span
                                key="count"
                                initial={{ opacity: 0, scale: 0.6 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.6 }}
                                transition={{ duration: 0.15 }}
                                className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
                                aria-hidden
                            >
                                {active}
                            </motion.span>
                        )}
                    </AnimatePresence>
                </Button>
                {settings}
            </div>
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
                <Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar por código ou título" className={cn(TASKS_MOBILE_SEARCH_CLASS, "bg-transparent pl-8")} aria-label="Buscar tarefas" />
            </div>
            <AnimatePresence initial={false}>
                {active > 0 && (
                    <motion.div key="chips" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                        <TooltipProvider>
                            <ActiveFilterChips chips={visibleChips} maxVisible={visibleChips.length} className="flex-nowrap overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0" />
                        </TooltipProvider>
                    </motion.div>
                )}
            </AnimatePresence>
            <ActionSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filtros" description="Filtros da lista de tarefas da central." testId="dev-center-filters-sheet">
                <TooltipProvider>
                    <div className="space-y-2">{filters}</div>
                </TooltipProvider>
                <SheetClose asChild>
                    <Button type="button" className="h-11 w-full">
                        {seeTasksLabel(count)}
                    </Button>
                </SheetClose>
            </ActionSheet>
        </div>
    )
}
