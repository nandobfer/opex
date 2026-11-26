"use client"

import { AnimatePresence, motion } from "framer-motion"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useOrcamentoClients } from "@/features/orcamentos/hooks/useOrcamentos"

export type AgentOriginFilterValue = "all" | "owner" | "client"

const ORIGIN_OPTIONS = [
    { value: "all", label: "Todas as origens" },
    { value: "owner", label: "Do dono" },
    { value: "client", label: "Do portal" },
] as const satisfies readonly { value: AgentOriginFilterValue; label: string }[]

const ALL_CLIENTS = "all"

interface AgentStatusOption<T extends string> {
    value: T
    label: string
}

interface AgentOriginFilterProps<T extends string> {
    /** Rótulo do item listado (ex.: "jobs", "observações") para a acessibilidade. */
    noun: string
    statusOptions: readonly AgentStatusOption<T>[]
    status: T
    origin: AgentOriginFilterValue
    clientId: string | null
    onStatus: (value: T) => void
    onOrigin: (value: AgentOriginFilterValue) => void
    onClient: (value: string | null) => void
}

/**
 * Filtros das listas do Agente Opex em Integrações › Crons (Jobs e Observações): situação, origem (dono
 * ou portal) e, nos do portal, o cliente.
 */
export function AgentOriginFilter<T extends string>({ noun, statusOptions, status, origin, clientId, onStatus, onOrigin, onClient }: AgentOriginFilterProps<T>) {
    const clients = useOrcamentoClients()
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                <OptionTabs aria-label={`Filtrar ${noun}`} options={statusOptions} value={status} onChange={onStatus} size="sm" />
                <OptionTabs aria-label={`Origem dos ${noun}`} options={ORIGIN_OPTIONS} value={origin} onChange={onOrigin} size="sm" />
            </div>
            <AnimatePresence initial={false}>
                {origin === "client" && (
                    <motion.div key="client" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                        <Select value={clientId ?? ALL_CLIENTS} onValueChange={(value) => onClient(value === ALL_CLIENTS ? null : value)}>
                            <SelectTrigger className="w-full" aria-label={`Cliente dos ${noun}`}>
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
