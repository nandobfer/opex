"use client"

import { useQuery } from "@tanstack/react-query"
import type { PluginRuntimeEntry } from "../types"
import { ensurePluginCss, loadPluginClient } from "./loader"
import { usePluginSource } from "./PluginSourceContext"

/** Módulo do cliente de uma revisão (carregado uma vez; trocar de revisão carrega a nova). */
export function usePluginModule(entry: PluginRuntimeEntry) {
    const source = usePluginSource()
    return useQuery({
        queryKey: ["plugins", "module", source.kind, source.clientId, entry.id, entry.revision],
        staleTime: Infinity,
        gcTime: 10 * 60_000,
        retry: false,
        queryFn: async () => {
            const [module] = await Promise.all([loadPluginClient(entry, source), ensurePluginCss(entry, source)])
            return module
        },
    })
}
