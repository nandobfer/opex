"use client"

import { useMemo } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { BarChart3 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { PresetDateRangeFilter } from "@/components/ui/preset-date-range-filter"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { FilterGroup } from "@/components/list/FilterGroup"
import { apiErrorMessage } from "@/lib/api"
import { formatLogTimestamp } from "@/lib/integrations/log-format"
import type { AiApiKeyProviderId } from "../api-keys"
import { usageRangeQuery, withUsageKey } from "../provider-usage"
import { useUsageKeyFilter } from "../hooks/useUsageKeyFilter"
import { USAGE_FILTERS_GRID, UsageKeySelect } from "./UsageKeySelect"
import { useProviderUsage } from "../hooks/useProviderUsage"
import { useUsageRange } from "../hooks/useUsageRange"
import { UsageBreakdownTable } from "./UsageBreakdownTable"
import { UsageRefreshButton } from "./UsageRefreshButton"

interface ProviderUsageCardProps {
    /** Provedor consultado: `opencode` ou um dos provedores diretos (Gemini, Anthropic, OpenAI, DeepSeek, OpenCode Go). */
    provider: string
    title: string
    description: string
    firstColumnLabel: string
    emptyTitle: string
    /** Provedores que não informam custo mostram só tokens (sem a coluna Custo). */
    showCost?: boolean
    /** Painel prospectivo: informa desde quando há medição. */
    showCoverage?: boolean
    /** Provedor com chaveiro (OPE-155): mostra o filtro "Chave de API". */
    keyFilter?: AiApiKeyProviderId
}

/**
 * Painel de consumo de um provedor: filtro de período na URL (padrão Último mês), tabela por
 * recurso com o total e notas de cobertura. Métricas ausentes aparecem como `—`; totais parciais
 * são sinalizados, nunca apresentados como medição completa.
 */
export function ProviderUsageCard({ provider, title, description, firstColumnLabel, emptyTitle, showCost = true, showCoverage = false, keyFilter }: ProviderUsageCardProps) {
    const reducedMotion = useReducedMotion()
    const { range, setRange, defaults } = useUsageRange()
    const usageKey = useUsageKeyFilter(keyFilter ?? null)
    const query = useMemo(() => withUsageKey(usageRangeQuery(range.usageFrom, range.usageTo), usageKey.value), [range.usageFrom, range.usageTo, usageKey.value])
    const usage = useProviderUsage(provider, query)
    const data = usage.data
    const view = query === null ? "invalid" : usage.isLoading ? "loading" : usage.isError ? "error" : !data?.rows.length ? "empty" : "data"
    const missing = data
        ? [
              data.missingInputRequests > 0 ? `${data.missingInputRequests.toLocaleString("pt-BR")} sem tokens de entrada` : null,
              data.missingOutputRequests > 0 ? `${data.missingOutputRequests.toLocaleString("pt-BR")} sem tokens de saída` : null,
              data.missingTokenRequests > 0 ? `${data.missingTokenRequests.toLocaleString("pt-BR")} sem tokens totais` : null,
              showCost && data.missingCostRequests > 0 ? `${data.missingCostRequests.toLocaleString("pt-BR")} sem custo` : null,
          ].filter((part): part is string => part !== null)
        : []
    // "1 sem X, 2 sem Y e 3 sem Z" — vírgulas entre as partes e "e" antes da última.
    const missingText = missing.length > 1 ? `${missing.slice(0, -1).join(", ")} e ${missing[missing.length - 1]}` : missing[0]

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" aria-hidden />{title}</CardTitle>
                    <UsageRefreshButton fetching={usage.isFetching} disabled={query === null} onClick={() => void usage.refetch()} />
                </div>
                <p className="text-sm text-muted-foreground">{description}</p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className={keyFilter ? USAGE_FILTERS_GRID : undefined}>
                    <FilterGroup label="Período">
                        <PresetDateRangeFilter startDate={range.usageFrom} endDate={range.usageTo} onChange={(next) => setRange({ usageFrom: next.startDate, usageTo: next.endDate })} />
                    </FilterGroup>
                    {keyFilter && <UsageKeySelect value={usageKey.value} options={usageKey.options} onChange={usageKey.setValue} />}
                </div>
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.15 }}>
                        {view === "invalid" && <ErrorState title="Período inválido" description="Selecione datas válidas, com início anterior ao fim." onRetry={() => setRange(defaults)} />}
                        {view === "loading" && <div className="space-y-2" role="status" aria-label="Carregando consumo"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>}
                        {view === "error" && <ErrorState title="Não foi possível carregar o consumo" description={apiErrorMessage(usage.error, "Tente novamente.")} onRetry={() => void usage.refetch()} />}
                        {view === "empty" && <EmptyState icon={BarChart3} title={emptyTitle} description={keyFilter ? "Selecione outro período ou outra chave para consultar o consumo." : "Selecione outro período para consultar o consumo."} actionLabel="Último mês" onAction={() => setRange(defaults)} />}
                        {view === "data" && data && (
                            <div className="space-y-3">
                                <UsageBreakdownTable firstColumnLabel={firstColumnLabel} rows={data.rows} total={data.total} showCost={showCost} />
                                {missing.length > 0 && <p role="note" className="text-xs text-muted-foreground">Totais parciais: {missingText}. Métricas desconhecidas não são consideradas zero.</p>}
                                {showCoverage && data.coverageFrom && <p className="text-xs text-muted-foreground">Medição iniciada em {formatLogTimestamp(data.coverageFrom).slice(0, 16)}.</p>}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </CardContent>
        </Card>
    )
}
