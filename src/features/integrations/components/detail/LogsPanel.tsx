"use client"

import type { RefObject } from "react"
import { Bug } from "lucide-react"
import type { IntegrationId } from "@/lib/integrations/catalog"
import { DebugConsoleCloseButton } from "../DebugConsoleCloseButton"
import { DebugLogsPanel } from "../DebugLogsPanel"
import { IntegrationDebugConsole } from "../IntegrationDebugConsole"

interface LogsPanelProps {
    id: IntegrationId
    visible: boolean
    debugHeight: number | null | undefined
    logsCardRef: RefObject<HTMLDivElement | null>
    maximized: boolean
    onMaximizedChange: (maximized: boolean) => void
    onClose: () => void
    /** `id` do painel, alvo do `aria-controls` do botão do título. */
    panelId: string
}

/** Painel lateral de logs da integração (modo debug), sobre o `DebugLogsPanel` compartilhado. */
export function LogsPanel({ id, visible, debugHeight, logsCardRef, maximized, onMaximizedChange, onClose, panelId }: LogsPanelProps) {
    return (
        <DebugLogsPanel visible={visible} debugHeight={debugHeight} logsCardRef={logsCardRef} panelId={panelId} testId="integration-debug-panel">
            <IntegrationDebugConsole
                integrationId={id}
                className="flex-1"
                consoleClassName="min-h-0 flex-1"
                maximized={maximized}
                onMaximizedChange={onMaximizedChange}
                actions={<DebugConsoleCloseButton onClick={onClose} />}
                title={
                    <h2 className="flex items-center gap-2 text-base font-semibold">
                        <Bug className="h-4 w-4 text-amber-600" /> Logs
                    </h2>
                }
            />
        </DebugLogsPanel>
    )
}
