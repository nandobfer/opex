"use client"

import { useMemo } from "react"
import { api } from "@/lib/api"
import { isPusherClientAvailable } from "@/lib/pusher/client"
import { pluginDebugChannel } from "@/lib/pusher/channel-names"
import type { IntegrationLogLine } from "@nandobfer/integracoes"
import { useDebugLogStream, type DebugLogStreamSource } from "@nandobfer/integracoes/react"
import { PLUGIN_DEBUG_EVENT } from "../constants"

/** Logs de debug de um plugin (só o dono): `plugin_logs` (48 h) + tempo real em `private-plugin-{id}`. */
export function usePluginDebugLogs(pluginId: string, options: { enabled: boolean; onLines: (lines: IntegrationLogLine[], reset: boolean) => void }) {
    const realtime = isPusherClientAvailable()
    const source = useMemo<DebugLogStreamSource>(
        () => ({
            key: pluginId,
            fetch: async (params) => (await api.get<{ data: IntegrationLogLine[] }>(`/plugins/${pluginId}/logs`, { params })).data.data,
            realtime: realtime ? { channel: pluginDebugChannel(pluginId), event: PLUGIN_DEBUG_EVENT } : null,
        }),
        [pluginId, realtime],
    )
    return useDebugLogStream(source, options)
}
