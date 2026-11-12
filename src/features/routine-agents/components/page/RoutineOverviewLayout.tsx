"use client"

import type { ReactNode } from "react"
import { MetricsOverviewSkeleton } from "@/components/metrics/MetricsOverviewSkeleton"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { ROUTINE_CHAT_PANEL, ROUTINE_CHAT_PANEL_EXPANDED, ROUTINE_OVERVIEW_GRID, ROUTINE_OVERVIEW_MAIN } from "./routine-agents-layout"

/**
 * Visão geral do agente rotineiro em duas colunas (OPE-160): filtros, KPIs e gráficos à esquerda e a
 * conversa com o agente à direita (recolhível; recolhida, a esquerda ocupa quase toda a largura).
 */
export function RoutineOverviewLayout({ filters, chat, children }: { filters?: ReactNode; chat: ReactNode; children: ReactNode }) {
    return (
        <div className={ROUTINE_OVERVIEW_GRID} data-testid="routine-overview-layout">
            <div className={ROUTINE_OVERVIEW_MAIN}>
                {filters}
                {children}
            </div>
            {chat}
        </div>
    )
}

/** Carregamento da página do agente: cabeçalho, abas e as duas colunas da Visão geral, com as mesmas classes. */
export function RoutineAgentPageSkeleton() {
    return (
        <div className="space-y-4" aria-busy aria-label="Carregando o agente rotineiro">
            <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-md" />
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-7 w-1/3" />
                    <Skeleton className="h-4 w-2/3" />
                </div>
            </div>
            <Skeleton className="h-10 w-full" />
            <div className={ROUTINE_OVERVIEW_GRID}>
                <div className={ROUTINE_OVERVIEW_MAIN}>
                    <Skeleton className="h-10 w-full" />
                    <MetricsOverviewSkeleton kpis={6} charts={2} />
                </div>
                <div className={cn(ROUTINE_CHAT_PANEL, ROUTINE_CHAT_PANEL_EXPANDED, "w-full lg:w-[440px]")} data-testid="routine-chat-skeleton">
                    <Skeleton className="m-3 h-8 w-2/3" />
                    <Skeleton className="mx-3 mt-auto mb-3 h-12" />
                </div>
            </div>
        </div>
    )
}
