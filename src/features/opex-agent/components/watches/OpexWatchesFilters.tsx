"use client"

import type { OpexJobOriginFilter } from "../../jobs"
import type { OpexWatchFilter } from "../../watches"
import { AgentOriginFilter } from "../scheduled/AgentOriginFilter"

const FILTER_OPTIONS = [
    { value: "active", label: "Ativas" },
    { value: "finished", label: "Encerradas" },
    { value: "all", label: "Todas" },
] as const satisfies readonly { value: OpexWatchFilter; label: string }[]

interface OpexWatchesFiltersProps {
    filter: OpexWatchFilter
    origin: OpexJobOriginFilter
    clientId: string | null
    onFilter: (value: OpexWatchFilter) => void
    onOrigin: (value: OpexJobOriginFilter) => void
    onClient: (value: string | null) => void
}

/** Filtros da aba Observações: situação, origem (dono ou portal) e, nas do portal, o cliente. */
export function OpexWatchesFilters({ filter, origin, clientId, onFilter, onOrigin, onClient }: OpexWatchesFiltersProps) {
    return <AgentOriginFilter noun="observações" statusOptions={FILTER_OPTIONS} status={filter} origin={origin} clientId={clientId} onStatus={onFilter} onOrigin={onOrigin} onClient={onClient} />
}
