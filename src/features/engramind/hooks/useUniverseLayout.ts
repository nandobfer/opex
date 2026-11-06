"use client"

import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { UniverseLayoutConfig } from "@engramind/client"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { ENGRAMIND_UPDATED_EVENT, UNIVERSE_LAYOUT_EVENT_TYPE } from "../constants"
import { areaKey, engramindGet, engramindKey, engramindSend, useEngramindMutation } from "./useEngramind"
import type { UniverseLayoutDto } from "../types"

export const UNIVERSE_LAYOUT_ROUTE = "universe-layout"

/**
 * Layout dos universos de memórias (OPE-142): a consulta alimenta o `OpexEngramindProvider` (vale para a
 * rede, os universos de `/integracoes/ia` e a aba Memórias dos rotineiros) e a aba Visualização. Muda por
 * tempo real (`engramind-updated` com `universe-layout`), sem recarregar a página.
 */
export function useUniverseLayout(options: { enabled?: boolean; /** Assina o `engramind-updated` (o provider das telas de rede; a aba já assina pelo `useEngramindRealtime`). */ realtime?: boolean } = {}) {
    const queryClient = useQueryClient()
    const realtime = options.realtime === true
    useEffect(() => {
        if (!realtime || !isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = (payload: { type?: string }) => {
            if (payload?.type === UNIVERSE_LAYOUT_EVENT_TYPE) void queryClient.invalidateQueries({ queryKey: areaKey(UNIVERSE_LAYOUT_ROUTE) })
        }
        channel.bind(ENGRAMIND_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(ENGRAMIND_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [realtime, queryClient])
    return useQuery({
        queryKey: engramindKey(UNIVERSE_LAYOUT_ROUTE),
        queryFn: () => engramindGet<UniverseLayoutDto>(UNIVERSE_LAYOUT_ROUTE),
        enabled: options.enabled !== false,
        staleTime: 5 * 60_000,
        retry: 1,
    })
}

/** Grava a configuração completa (o servidor recusa campo desconhecido ou fora do intervalo, sem gravar nada). */
export function useSaveUniverseLayout() {
    return useEngramindMutation((config: UniverseLayoutConfig) => engramindSend<UniverseLayoutDto>("put", UNIVERSE_LAYOUT_ROUTE, config), { invalidate: [UNIVERSE_LAYOUT_ROUTE], success: "Visualização salva" })
}

/** Volta ao padrão (apaga a configuração gravada). */
export function useResetUniverseLayout() {
    return useEngramindMutation(() => engramindSend<UniverseLayoutDto>("delete", UNIVERSE_LAYOUT_ROUTE), { invalidate: [UNIVERSE_LAYOUT_ROUTE], success: "Visualização restaurada ao padrão" })
}
