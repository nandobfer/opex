"use client"

import { useMemo } from "react"
import { DATE_PRESET } from "@/components/ui/preset-date-range-filter"
import { urlFilterCodecs, useUrlFilters } from "@/hooks/useUrlFilters"

const RANGE_SCHEMA = { usageFrom: urlFilterCodecs.string(), usageTo: urlFilterCodecs.string() }

export interface UsageRange {
    usageFrom: string
    usageTo: string
}

/**
 * Período dos painéis de consumo, na URL (`usageFrom`/`usageTo`). Padrão **Último mês**, como no
 * JEV e no OpenCode; o filtro é compartilhado pelos cards de todos os provedores.
 */
export function useUsageRange() {
    const defaults = useMemo<UsageRange>(() => {
        const period = DATE_PRESET.month.getRange()
        return { usageFrom: period.startDate, usageTo: period.endDate }
    }, [])
    const [range, setRange] = useUrlFilters(defaults, RANGE_SCHEMA)
    return { range, setRange, defaults }
}
