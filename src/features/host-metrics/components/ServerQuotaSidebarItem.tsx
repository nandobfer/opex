"use client"

import { useReducedMotion } from "framer-motion"
import { Gauge } from "lucide-react"
import { useNow } from "@/hooks/useNow"
import { SidebarHoverButtonItem } from "@/features/layout/components/sidebar/SidebarHoverButtonItem"
import { OpencodeQuotaPanel } from "@/features/opencode-quota/components/OpencodeQuotaPanel"
import { useOpencodeQuota, useOpencodeQuotaRealtime } from "@/features/opencode-quota/hooks/useOpencodeQuota"
import { useQuotaPanelPrefs } from "@/features/opencode-quota/hooks/useQuotaPanelPrefs"
import { visibleQuotaLevel } from "@/features/opencode-quota/logic"
import { useHostMetrics, useHostMetricsRealtime } from "../hooks/useHostMetrics"
import { hostMetricsLevel } from "../logic"
import { HostMetricsPanel } from "./HostMetricsPanel"
import { StatusDots } from "./StatusDots"

export const SERVER_QUOTA_LABEL = "Servidor e quota"

/**
 * "Servidor e quota" no rodapé do menu do dono, acima do Agente Opex: o painel mostra os recursos do
 * servidor e, abaixo, a mesma quota do OpenCode de /desenvolvimento. As bolinhas ficam vivas com o
 * painel fechado (mesmas queries, preferência e eventos — sem requisição a mais).
 */
export function ServerQuotaSidebarItem({ collapsed }: { collapsed: boolean }) {
    const reduceMotion = useReducedMotion() ?? false
    const host = useHostMetrics()
    useHostMetricsRealtime()
    const quota = useOpencodeQuota()
    useOpencodeQuotaRealtime()
    const { value: prefs } = useQuotaPanelPrefs()
    const now = useNow(5_000)

    return (
        <SidebarHoverButtonItem
            label={SERVER_QUOTA_LABEL}
            drawerLabel="Servidor"
            icon={Gauge}
            collapsed={collapsed}
            reduceMotion={reduceMotion}
            indicator={<StatusDots server={hostMetricsLevel(host.data, now)} quota={visibleQuotaLevel(quota.data, prefs, now)} />}
            panelWidthClassName="w-80"
            testId="sidebar-server-quota"
            panel={
                <div className="space-y-2 px-1 pb-1">
                    <HostMetricsPanel />
                    <OpencodeQuotaPanel />
                </div>
            }
        />
    )
}
