"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { PlugZap, Server, TriangleAlert } from "lucide-react"
import { PanelMessage } from "@/components/metrics/PanelMessage"
import { RefreshIconButton } from "@/components/metrics/RefreshIconButton"
import { StaleBadge } from "@/components/metrics/StaleBadge"
import { Button } from "@/components/ui/button"
import { useNow } from "@/hooks/useNow"
import { HOST_METRICS_MESSAGES } from "../constants"
import { useHostMetrics, useHostMetricsRealtime, useRefreshHostMetrics } from "../hooks/useHostMetrics"
import { isHostMetricsStale } from "../logic"
import { HostMetricsRows } from "./HostMetricsRows"
import { HostMetricsSkeleton } from "./HostMetricsSkeleton"
import { HOST_HEADER_CLASS, HOST_PANEL_CLASS } from "./host-metrics-layout"

const STALE_TITLE = "Sem leitura dos recursos do servidor dentro do prazo. Confira se o OpenCode está rodando e se a rotina de Crons está ligada."

/**
 * Bloco "Servidor" (CPU, RAM, swap e disco da máquina do OpenCode): carga inicial pelo GET e, depois,
 * só o evento em tempo real; "Atualizar" lê na hora. Falha ou leitura antiga mantém as últimas barras
 * com a etiqueta "Desatualizado".
 */
export function HostMetricsPanel() {
    const query = useHostMetrics()
    useHostMetricsRealtime()
    const refresh = useRefreshHostMetrics()
    const now = useNow(5_000)
    const data = query.data

    if (query.isLoading) return <HostMetricsSkeleton />

    const metrics = data?.metrics ?? null
    const stale = !!data && !!metrics && (data.state !== "ok" || isHostMetricsStale(data, now))
    const retry = () => refresh.mutate()

    return (
        <section aria-label="Servidor" className={HOST_PANEL_CLASS} data-testid="host-metrics-panel">
            <div className={HOST_HEADER_CLASS}>
                <Server className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span className="shrink-0 text-xs font-medium">Servidor</span>
                {data?.checkedAt && <span className="min-w-0 truncate text-[10px] text-muted-foreground">Atualizado às {format(new Date(data.checkedAt), "HH:mm:ss", { locale: ptBR })}</span>}
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    {stale && <StaleBadge title={STALE_TITLE} />}
                    <RefreshIconButton onClick={retry} disabled={refresh.isPending} busy={refresh.isPending} ariaLabel="Atualizar recursos do servidor" />
                </span>
            </div>
            {metrics ? (
                <HostMetricsRows metrics={metrics} />
            ) : (
                <div className="pt-2">
                    {data?.state === "unconfigured" ? (
                        <PanelMessage icon={PlugZap} title={HOST_METRICS_MESSAGES.unconfigured} />
                    ) : (
                        <PanelMessage icon={TriangleAlert} tone="destructive" title={HOST_METRICS_MESSAGES.error}>
                            <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={retry}>
                                Tentar novamente
                            </Button>
                        </PanelMessage>
                    )}
                </div>
            )}
        </section>
    )
}
