"use client"

import type { OpexJobFilter, OpexJobOriginFilter } from "../../jobs"
import { AgentOriginFilter } from "../scheduled/AgentOriginFilter"

const FILTER_OPTIONS = [
    { value: "scheduled", label: "Agendados" },
    { value: "finished", label: "Executados" },
    { value: "all", label: "Todos" },
] as const satisfies readonly { value: OpexJobFilter; label: string }[]

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
    return <AgentOriginFilter noun="jobs" statusOptions={FILTER_OPTIONS} status={filter} origin={origin} clientId={clientId} onStatus={onFilter} onOrigin={onOrigin} onClient={onClient} />
}
