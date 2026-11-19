"use client"

import { useMemo } from "react"
import { api } from "@/lib/api"
import { isPusherClientAvailable } from "@/lib/pusher/client"
import { getIntegrationDef, integrationDebugChannel, INTEGRATION_DEBUG_EVENT, type IntegrationId } from "@/lib/integrations/catalog"
import type { IntegrationLogLine } from "@/lib/integrations/log-format"
import { useDebugLogStream, type DebugLogStreamSource } from "./useDebugLogStream"

export type { DebugStreamMode } from "./useDebugLogStream"

function inScope(line: IntegrationLogLine, scope: string): boolean {
    return typeof line.data === "object" && line.data !== null && (line.data as { scope?: unknown }).scope === scope
}

/**
 * Logs de debug de uma integração: carga inicial do Mongo (48h) + tempo real pelo Pusher
 * quando disponível. Sem Pusher (ou para a própria integração Pusher, que não se
 * retransmite), o modo é `manual` e a tela oferece "Atualizar".
 */
export function useIntegrationDebugLogs(
    id: IntegrationId,
    options: { enabled: boolean; onLines: (lines: IntegrationLogLine[], reset: boolean) => void; scope?: string },
) {
    const { scope } = options
    const realtime = isPusherClientAvailable() && getIntegrationDef(id).streamsDebugOverPusher
    const source = useMemo<DebugLogStreamSource>(
        () => ({
            key: `${id}|${scope ?? ""}`,
            fetch: async (params) => (await api.get<{ data: IntegrationLogLine[] }>(`/integrations/${id}/logs`, { params: { ...params, ...(scope ? { scope } : {}) } })).data.data,
            realtime: realtime ? { channel: integrationDebugChannel(id), event: INTEGRATION_DEBUG_EVENT } : null,
            accept: scope ? (line) => inScope(line, scope) : undefined,
        }),
        [id, realtime, scope],
    )
    return useDebugLogStream(source, options)
}
