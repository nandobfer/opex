"use client"

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Gauge, KeyRound, TriangleAlert } from "lucide-react"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { RefreshIconButton } from "@/components/metrics/RefreshIconButton"
import { StaleBadge } from "@/components/metrics/StaleBadge"
import { PanelMessage } from "@/components/metrics/PanelMessage"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useNow } from "@/hooks/useNow"
import { apiErrorMessage } from "@/lib/api"
import { integrationPath } from "@/lib/integrations/catalog"
import type { UsageQuery } from "@/features/ai/provider-usage"
import { GO_STALE_AFTER_MS } from "../../go-constants"
import { goKeyLabel, isGoUsageStale } from "../../go-logic"
import { useOpencodeGoUsage, useOpencodeGoUsageRealtime, useRefreshOpencodeGoUsage } from "../../hooks/useOpencodeGoUsage"
import { GoCoverageNotes } from "./GoCoverageNotes"
import { GoUsageChart } from "./GoUsageChart"
import { GoUsageHeader } from "./GoUsageHeader"
import { GoUsageSkeleton } from "./GoUsageSkeleton"
import { GoUsageWindows } from "./GoUsageWindows"

/**
 * Consumo da assinatura OpenCode Go (OPE-167), lido do Console com a chave do filtro: % do mês, renovação,
 * as três janelas e o gráfico com a previsão. Só percentual (o medidor não é dinheiro); o único valor em
 * US$ é o gasto real do ciclo, discreto. Atualiza pelo evento da rotina; o botão relê na hora.
 */
export function OpencodeGoSubscriptionCard({ query }: { query: UsageQuery | null }) {
    const reduceMotion = useReducedMotion()
    const usage = useOpencodeGoUsage(query)
    useOpencodeGoUsageRealtime()
    const refresh = useRefreshOpencodeGoUsage(query)
    const now = useNow(30_000)
    const data = usage.data
    const view = query === null ? "invalid" : usage.isLoading ? "loading" : usage.isError ? "request-error" : (data?.state ?? "loading")
    const stale = data?.state === "ok" && isGoUsageStale(data.checkedAt, now, GO_STALE_AFTER_MS)
    const retry = () => refresh.mutate()
    const keyLabel = data ? goKeyLabel(data.scope, data.keyName) : null
    const failedKeys = data?.state === "ok" ? (data.scope?.failed ?? []) : []

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Gauge className="h-4 w-4 text-primary" aria-hidden />
                        Assinatura OpenCode Go
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                        {stale && <StaleBadge title="A assinatura não é lida há mais de 15 min. Confira a rotina “opencode-go-usage-refresh” em Integrações › Crons." />}
                        <RefreshIconButton onClick={retry} busy={refresh.isPending || usage.isFetching} disabled={query === null || refresh.isPending} ariaLabel="Atualizar consumo da assinatura OpenCode Go" />
                    </div>
                </div>
                <p className="text-sm text-muted-foreground">
                    Uso da assinatura inteira, lido do Console do OpenCode Go: inclui outros clientes (OpenCode no host ou no desktop), não só o Opex.
                    {keyLabel && (
                        <>
                            {" "}
                            <span data-go-keys title={data?.scope?.keys.map((key) => key.name).join(", ")}>
                                {keyLabel}.
                            </span>
                        </>
                    )}
                </p>
            </CardHeader>
            <CardContent>
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.15 }}>
                        {view === "invalid" && <ErrorState title="Período inválido" description="Selecione datas válidas, com início anterior ao fim." />}
                        {view === "loading" && <GoUsageSkeleton />}
                        {view === "request-error" && <ErrorState title="Não foi possível carregar a assinatura" description={apiErrorMessage(usage.error, "Tente novamente.")} onRetry={() => void usage.refetch()} />}
                        {view === "error" && <ErrorState title="Não foi possível ler a assinatura" description={data?.message ?? "Tente novamente."} onRetry={retry} />}
                        {view === "unconfigured" && (
                            <PanelMessage icon={KeyRound} title="Nenhuma chave do OpenCode Go em uso" description={data?.message ?? undefined}>
                                <Button asChild size="sm" variant="outline" className="h-6 px-2 text-[11px]">
                                    <Link href={integrationPath("ai_opencode_go")}>Cadastrar chave</Link>
                                </Button>
                            </PanelMessage>
                        )}
                        {view === "no-key" && <EmptyState icon={KeyRound} title="Sem assinatura para este filtro" description={data?.message ?? undefined} />}
                        {view === "ok" && data && (
                            <div className="space-y-5">
                                <AnimatePresence initial={false}>
                                    {failedKeys.length > 0 && (
                                        <motion.div key="partial" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: reduceMotion ? 0 : 0.2 }}>
                                            <PanelMessage
                                                icon={TriangleAlert}
                                                tone="warning"
                                                title="Cobertura parcial"
                                                description={`Fora da soma: ${failedKeys.map((key) => `${key.name} (${key.message})`).join("; ")}`}
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                <GoUsageHeader data={data} />
                                <GoUsageWindows meters={data.meters} now={now} />
                                {data.chart ? (
                                    <div className="space-y-2">
                                        <GoUsageChart chart={data.chart} dailyAverage={data.forecast?.dailyAverage ?? null} />
                                        <GoCoverageNotes chart={data.chart} scope={data.scope} />
                                    </div>
                                ) : (
                                    data.chartMessage && <PanelMessage icon={TriangleAlert} tone="warning" title="Gráfico indisponível" description={data.chartMessage} />
                                )}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </CardContent>
        </Card>
    )
}
