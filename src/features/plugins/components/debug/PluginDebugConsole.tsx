"use client"

import type { ReactNode } from "react"
import { DebugLogConsole, useDebugTerminal } from "@nandobfer/integracoes/react"
import { usePluginDebugLogs } from "../../hooks/usePluginDebugLogs"

/** Terminal de logs de um plugin (mesmo terminal das integrações, sem "Testar conexão"). */
export function PluginDebugConsole({ pluginId, title, description, actions, className, consoleClassName, maximized, onMaximizedChange }: { pluginId: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string; consoleClassName?: string; maximized?: boolean; onMaximizedChange?: (maximized: boolean) => void }) {
    const terminal = useDebugTerminal(`plugin ${pluginId}`)
    const logs = usePluginDebugLogs(pluginId, { enabled: true, onLines: terminal.onLines })
    return (
        <DebugLogConsole
            terminal={terminal}
            logs={logs}
            title={title}
            description={description}
            actions={actions}
            className={className}
            consoleClassName={consoleClassName}
            maximized={maximized}
            onMaximizedChange={onMaximizedChange}
            placeholder="Aguardando eventos do plugin..."
        />
    )
}
