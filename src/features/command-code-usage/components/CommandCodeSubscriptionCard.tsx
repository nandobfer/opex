"use client"

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { CircleOff, Gauge, KeyRound, TriangleAlert } from "lucide-react"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { PanelMessage } from "@/components/metrics/PanelMessage"
import { RefreshIconButton } from "@/components/metrics/RefreshIconButton"
import { StaleBadge } from "@/components/metrics/StaleBadge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useNow } from "@/hooks/useNow"
import { apiErrorMessage } from "@/lib/api"
import { integrationPath } from "@/lib/integrations/catalog"
import type { UsageQuery } from "@/features/ai/provider-usage"
import { CycleUsageChart } from "@/features/subscription-usage/components/CycleUsageChart"
import { SubscriptionUsageHeader } from "@/features/subscription-usage/components/SubscriptionUsageHeader"
import { SubscriptionUsageSkeleton } from "@/features/subscription-usage/components/SubscriptionUsageSkeleton"
import { UsageWindows } from "@/features/subscription-usage/components/UsageWindows"
import { formatUsageDateTime, formatUsageUsd, isUsageStale } from "@/features/subscription-usage/cycle-logic"
import { CC_STALE_AFTER_MS } from "../constants"
import { useCommandCodeUsage, useCommandCodeUsageRealtime, useRefreshCommandCodeUsage } from "../hooks/useCommandCodeUsage"
import { ccKeyLabel } from "../logic"
import type { CommandCodeUsageDto } from "../types"
import { CcCoverageNotes } from "./CcCoverageNotes"

const SUBJECT = "Command Code"

/** Valores em US$ discretos à direita do cabeçalho: valor de uso do ciclo (preço de API) e créditos extras. */
function CcMoneyAside({ data }: { data: CommandCodeUsageDto }) {
    if (data.usageValueUsd === null && data.extraCreditsUsd === null) return null
    return (
        <div className="space-y-0.5 pt-1 text-right text-[11px] text-muted-foreground">
            {data.usageValueUsd !== null && (
                <p title="Soma do custo das requisições a preço de API desde o início do ciclo (usage/summary). Não é o valor cobrado pela assinatura." data-cc-usage-value>
                    Valor de uso no ciclo: {formatUsageUsd(data.usageValueUsd)}
                    {data.usageValuePartial && <span> (parcial: alguma conta não informou)</span>}
                </p>
            )}
            {data.extraCreditsUsd !== null && <p data-cc-extra>Créditos extras: {formatUsageUsd(data.extraCreditsUsd)}</p>}
        </div>
    )
}

/**
 * Consumo da assinatura Command Code (OPE-190), lido da API da CLI com a chave do filtro: % do mês, renovação, as
 * janelas de 5h e semanal, o mensal derivado e o gráfico com a previsão. O dinheiro aparece só discreto. Atualiza
 * pelo evento da rotina; o botão relê na hora.
 */
export function CommandCodeSubscriptionCard({ query }: { query: UsageQuery | null }) {
    const reduceMotion = useReducedMotion()
    const usage = useCommandCodeUsage(query)
    useCommandCodeUsageRealtime()
    const refresh = useRefreshCommandCodeUsage(query)
    const now = useNow(30_000)
    const data = usage.data
    const view = query === null ? "invalid" : usage.isLoading ? "loading" : usage.isError ? "request-error" : (data?.state ?? "loading")
    const stale = data?.state === "ok" && isUsageStale(data.checkedAt, now, CC_STALE_AFTER_MS)
    const retry = () => refresh.mutate()
    const keyLabel = data ? ccKeyLabel(data.scope, data.keyName) : null
    const failedKeys = data?.state === "ok" ? (data.scope?.failed ?? []) : []
    const renewalTitle = data?.cycle ? `Renova em ${formatUsageDateTime(data.cycle.endsAt)}${data.scope?.cyclesDiffer && data.scope.cycleKeyName ? ` — renovação mais próxima entre as contas somadas (chave ${data.scope.cycleKeyName})` : ""}` : undefined

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Gauge className="h-4 w-4 text-primary" aria-hidden />
                        Assinatura Command Code
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                        {stale && <StaleBadge title="A assinatura não é lida há mais de 15 min. Confira a rotina “command-code-usage-refresh” em Integrações › Crons." />}
                        <RefreshIconButton onClick={retry} busy={refresh.isPending || usage.isFetching} disabled={query === null || refresh.isPending} ariaLabel="Atualizar consumo da assinatura Command Code" />
                    </div>
                </div>
                <p className="text-sm text-muted-foreground">
                    Uso da conta inteira (CLI, outros clientes e o Opex), lido da API da CLI do Command Code.
                    {data?.planId && <span data-cc-plan> Plano: {data.planId}.</span>}
                    {keyLabel && (
                        <span data-cc-keys title={data?.scope?.keys.map((key) => key.name).join(", ")}>
                            {" "}
                            {keyLabel}.
                        </span>
                    )}
                </p>
            </CardHeader>
            <CardContent>
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.15 }}>
                        {view === "invalid" && <ErrorState title="Período inválido" description="Selecione datas válidas, com início anterior ao fim." />}
                        {view === "loading" && <SubscriptionUsageSkeleton />}
                        {view === "request-error" && <ErrorState title="Não foi possível carregar a assinatura" description={apiErrorMessage(usage.error, "Tente novamente.")} onRetry={() => void usage.refetch()} />}
                        {view === "error" && <ErrorState title="Não foi possível ler a assinatura" description={data?.message ?? "Tente novamente."} onRetry={retry} />}
                        {view === "unavailable" && <PanelMessage icon={CircleOff} tone="warning" title="Assinatura não legível" description={data?.message ?? undefined} />}
                        {view === "unconfigured" && (
                            <PanelMessage icon={KeyRound} title="Nenhuma chave do Command Code em uso" description={data?.message ?? undefined}>
                                <Button asChild size="sm" variant="outline" className="h-6 px-2 text-[11px]">
                                    <Link href={integrationPath("ai_command_code")}>Cadastrar chave</Link>
                                </Button>
                            </PanelMessage>
                        )}
                        {view === "no-key" && <EmptyState icon={KeyRound} title="Sem assinatura para este filtro" description={data?.message ?? undefined} />}
                        {view === "ok" && data && (
                            <div className="space-y-5">
                                <AnimatePresence initial={false}>
                                    {failedKeys.length > 0 && (
                                        <motion.div key="partial" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: reduceMotion ? 0 : 0.2 }}>
                                            <PanelMessage icon={TriangleAlert} tone="warning" title="Cobertura parcial" description={`Fora da soma: ${failedKeys.map((key) => `${key.name} (${key.message})`).join("; ")}`} />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                <SubscriptionUsageHeader view={data} label="Uso do Command Code" renewalTitle={renewalTitle} aside={<CcMoneyAside data={data} />} />
                                {data.meters.length > 0 && <UsageWindows meters={data.meters} now={now} subject={SUBJECT} />}
                                {data.chart ? (
                                    <div className="space-y-2">
                                        <CycleUsageChart chart={data.chart} dailyAverage={data.forecast?.dailyAverage ?? null} subject={SUBJECT} />
                                        <CcCoverageNotes chart={data.chart} scope={data.scope} />
                                    </div>
                                ) : (
                                    data.chartMessage && <PanelMessage icon={TriangleAlert} tone={data.noWindows ? "muted" : "warning"} title={data.noWindows ? "Sem janelas de uso" : "Gráfico indisponível"} description={data.chartMessage} />
                                )}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </CardContent>
        </Card>
    )
}
