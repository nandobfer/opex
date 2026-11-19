"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import type { AxiosInstance } from "axios"
import { api as ownerApi } from "@/lib/api"
import { appChannel, clientChannel } from "@/lib/pusher/channel-names"

/**
 * De onde a tela lê os plugins (OPE-172): o app do dono (`/api/plugins`, `private-app`) ou o portal
 * de um cliente (`/api/cliente/plugins`, axios do portal com `x-client-id`, `private-client-{id}`).
 * O mesmo carregador e as mesmas telas servem os dois; o portal envolve a árvore com o provider.
 */
export interface PluginSource {
    kind: "owner" | "client"
    clientId: string | null
    api: AxiosInstance
    /** Base das rotas no axios (`/plugins` ou `/cliente/plugins`). */
    base: string
    channel: string
}

const OWNER_SOURCE: PluginSource = { kind: "owner", clientId: null, api: ownerApi, base: "/plugins", channel: appChannel() }

const PluginSourceContext = createContext<PluginSource>(OWNER_SOURCE)

export function ClientPluginSourceProvider({ clientId, api, children }: { clientId: string; api: AxiosInstance; children: ReactNode }) {
    const value = useMemo<PluginSource>(() => ({ kind: "client", clientId, api, base: "/cliente/plugins", channel: clientChannel(clientId) }), [clientId, api])
    return <PluginSourceContext.Provider value={value}>{children}</PluginSourceContext.Provider>
}

export const usePluginSource = () => useContext(PluginSourceContext)
