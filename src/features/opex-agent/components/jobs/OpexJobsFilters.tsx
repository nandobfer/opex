"use client"

import { AnimatePresence, motion } from "framer-motion"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useOrcamentoClients } from "@/features/orcamentos/hooks/useOrcamentos"
import type { OpexJobFilter, OpexJobOriginFilter } from "../../jobs"

const FILTER_OPTIONS = [
    { value: "scheduled", label: "Agendados" },
    { value: "finished", label: "Executados" },
    { value: "all", label: "Todos" },
] as const satisfies readonly { value: OpexJobFilter; label: string }[]

const ORIGIN_OPTIONS = [
    { value: "all", label: "Todas as origens" },
    { value: "owner", label: "Do dono" },
    { value: "client", label: "Do portal" },
] as const satisfies readonly { value: OpexJobOriginFilter; label: string }[]

const ALL_CLIENTS = "all"

interface OpexJobsFiltersProps {
    filter: OpexJobFilter
    origin: OpexJobOriginFilter
    clientId: string | null
    onFilter: (value: OpexJobFilter) => void
    onOrigin: (value: OpexJobOriginFilter) => void
    onClient: (value: string | null) => void
}

/** Filtros da aba Jobs: situação, origem (dono ou portal) e, nos do portal, o cliente. */
export function OpexJobsFilters({ filter, origin, clientId, onFilter, onOrigin, onClient }: OpexJobsFiltersProps) {
    const clients = useOrcamentoClients()
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                <OptionTabs aria-label="Filtrar jobs" options={FILTER_OPTIONS} value={filter} onChange={onFilter} size="sm" />
                <OptionTabs aria-label="Origem dos jobs" options={ORIGIN_OPTIONS} value={origin} onChange={onOrigin} size="sm" />
            </div>
            <AnimatePresence initial={false}>
                {origin === "client" && (
                    <motion.div key="client" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                        <Select value={clientId ?? ALL_CLIENTS} onValueChange={(value) => onClient(value === ALL_CLIENTS ? null : value)}>
                            <SelectTrigger className="w-full" aria-label="Cliente dos jobs">
                                <SelectValue placeholder="Todos os clientes" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL_CLIENTS}>Todos os clientes</SelectItem>
                                {(clients.data ?? []).map((client) => (
                                    <SelectItem key={client.id} value={client.id}>
                                        {client.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
