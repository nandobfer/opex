"use client"

import { SidebarHoverNavItem } from "@/features/layout/components/sidebar/SidebarHoverNavItem"
import type { SidebarPanelItemProps } from "@/features/layout/types"
import { IntegrationActionDialogs, useIntegrationActionDialogs } from "../IntegrationActionDialogs"
import { IntegrationsNavPanelList } from "./IntegrationsNavPanelList"
import { INTEGRATIONS_NAV_PANEL_WIDTH } from "./integrations-nav-layout"

/**
 * "Integrações" na sidebar do dono (barra recolhida): o clique navega para `/integracoes` e o hover
 * (ou a seta →) abre o submenu com as integrações. Testar e debug fecham o submenu e abrem os mesmos
 * diálogos da página, que ficam montados fora do painel.
 */
export function IntegrationsSidebarItem({ item, active, reduceMotion, onNavigate }: SidebarPanelItemProps) {
    const dialogs = useIntegrationActionDialogs()
    return (
        <SidebarHoverNavItem
            item={item}
            active={active}
            reduceMotion={reduceMotion}
            onNavigate={onNavigate}
            panelWidthClassName={INTEGRATIONS_NAV_PANEL_WIDTH}
            panel={({ close }) => (
                <IntegrationsNavPanelList
                    onNavigate={() => {
                        close()
                        onNavigate?.()
                    }}
                    onTest={(id) => {
                        close()
                        dialogs.openTest(id)
                    }}
                    onDebug={(id) => {
                        close()
                        dialogs.openDebug(id)
                    }}
                />
            )}
        >
            <IntegrationActionDialogs state={dialogs} />
        </SidebarHoverNavItem>
    )
}
