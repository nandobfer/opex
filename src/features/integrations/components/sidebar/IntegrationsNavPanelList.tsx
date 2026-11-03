"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { AlertTriangle, Plug, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { integrationPath, type IntegrationId } from "@/lib/integrations/catalog"
import { isActiveHref } from "@/features/layout/navigation"
import {
    SIDEBAR_FOCUS_RING,
    SIDEBAR_PANEL_LINK,
    SIDEBAR_PANEL_LINK_ACTIVE,
    SIDEBAR_PANEL_LINK_IDLE,
} from "@/features/layout/components/sidebar/sidebar-styles"
import { useTopLevelIntegrations } from "../../hooks/useTopLevelIntegrations"
import { IntegrationStatusDot } from "../IntegrationBadges"
import { IntegrationRowActions } from "../IntegrationRowActions"
import {
    INTEGRATIONS_NAV_ACTION,
    INTEGRATIONS_NAV_DOT,
    INTEGRATIONS_NAV_LINK,
    INTEGRATIONS_NAV_ROW,
    INTEGRATIONS_NAV_SKELETON_ROWS,
} from "./integrations-nav-layout"

interface IntegrationsNavPanelListProps {
    /** Navegou por um link do submenu (fecha o painel e, no celular, a gaveta). */
    onNavigate: () => void
    onTest: (id: IntegrationId) => void
    onDebug: (id: IntegrationId) => void
}

function IntegrationsNavSkeleton() {
    return (
        <ul className="space-y-0.5" data-testid="integrations-nav-skeleton" aria-busy="true" aria-label="Carregando integrações">
            {Array.from({ length: INTEGRATIONS_NAV_SKELETON_ROWS }, (_, index) => (
                <li key={index} className={INTEGRATIONS_NAV_ROW}>
                    <span className={cn(SIDEBAR_PANEL_LINK, INTEGRATIONS_NAV_LINK)}>
                        <Skeleton className={INTEGRATIONS_NAV_DOT} />
                        <Skeleton className="h-4 flex-1" />
                    </span>
                    <Skeleton className={INTEGRATIONS_NAV_ACTION} />
                    <Skeleton className={INTEGRATIONS_NAV_ACTION} />
                </li>
            ))}
        </ul>
    )
}

/**
 * Lista do submenu de Integrações na sidebar: as integrações de `/integracoes`, na mesma ordem, com a
 * bolinha de status e os botões testar e debug. A linha inteira é um link para a integração, exceto
 * os botões. Montada só com o painel aberto: a consulta e o tempo real só existem enquanto ele está à vista.
 */
export function IntegrationsNavPanelList({ onNavigate, onTest, onDebug }: IntegrationsNavPanelListProps) {
    const pathname = usePathname()
    const { integrations, isLoading, isError, refetch, isRefetching } = useTopLevelIntegrations()

    if (isLoading) return <IntegrationsNavSkeleton />

    if (isError) {
        return (
            <div className="flex flex-col items-center gap-2 px-2.5 py-4 text-center" role="alert">
                <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
                <p className="text-sm text-muted-foreground">Não foi possível carregar as integrações.</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isRefetching}>
                    <RotateCw className={cn("h-3.5 w-3.5", isRefetching && "animate-spin")} aria-hidden />
                    Tentar novamente
                </Button>
            </div>
        )
    }

    if (!integrations.length) {
        return (
            <div className="flex flex-col items-center gap-2 px-2.5 py-4 text-center">
                <Plug className="h-5 w-5 text-muted-foreground" aria-hidden />
                <p className="text-sm text-muted-foreground">Nenhuma integração cadastrada.</p>
                <Button asChild variant="outline" size="sm">
                    <Link href="/integracoes" onClick={onNavigate}>
                        Abrir Integrações
                    </Link>
                </Button>
            </div>
        )
    }

    return (
        <ul className="space-y-0.5" data-testid="integrations-nav-list">
            {integrations.map((integration) => {
                const href = integrationPath(integration.id)
                const current = isActiveHref(pathname, href)
                return (
                    <li key={integration.id} className={INTEGRATIONS_NAV_ROW} data-integration-id={integration.id}>
                        <Link
                            href={href}
                            title={integration.name}
                            aria-current={current ? "page" : undefined}
                            onClick={onNavigate}
                            className={cn(SIDEBAR_PANEL_LINK, INTEGRATIONS_NAV_LINK, current ? SIDEBAR_PANEL_LINK_ACTIVE : SIDEBAR_PANEL_LINK_IDLE, "hover:bg-transparent", SIDEBAR_FOCUS_RING)}
                        >
                            <IntegrationStatusDot health={integration.health} />
                            <span className="min-w-0 flex-1 truncate">{integration.name}</span>
                        </Link>
                        <IntegrationRowActions integration={integration} onTest={() => onTest(integration.id)} onDebug={() => onDebug(integration.id)} size="sm" />
                    </li>
                )
            })}
        </ul>
    )
}
