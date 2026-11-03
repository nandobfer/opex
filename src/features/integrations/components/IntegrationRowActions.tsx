"use client"

import { TableAction } from "@/components/list/TableAction"
import type { IntegrationListItemDto } from "../types"

export const DEBUG_DISABLED_REASON = "Ative o modo debug na integração para acompanhar os logs"

interface IntegrationRowActionsProps {
    integration: Pick<IntegrationListItemDto, "debugMode">
    onTest: () => void
    onDebug: () => void
    size?: "default" | "sm"
}

/** "Testar conexão" e "Debug" de uma integração (lista de `/integracoes` e submenu da sidebar). */
export function IntegrationRowActions({ integration, onTest, onDebug, size }: IntegrationRowActionsProps) {
    return (
        <div className="flex shrink-0 items-center gap-1">
            <TableAction type="test" onClick={onTest} size={size} />
            <TableAction type="debug" onClick={onDebug} disabled={!integration.debugMode} disabledReason={DEBUG_DISABLED_REASON} size={size} />
        </div>
    )
}
