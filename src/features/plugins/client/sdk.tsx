"use client"

import { createContext, useContext, useEffect, type ReactNode } from "react"
import type { AxiosInstance } from "axios"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import type { PluginChannel } from "../constants"

/**
 * `@opex/plugin-sdk/client` (OPE-172): o que a interface de um plugin recebe do shell. Instância
 * única (a tabela de módulos compartilhados entrega ESTE módulo ao bundle do plugin).
 */

export interface PluginHost {
    pluginId: string
    versionNumber: number
    channel: PluginChannel
    /** `dono` no app do dono; `cliente` no portal (o axios já manda o cliente da sessão). */
    scope: "owner" | "client"
    clientId: string | null
    /** Axios do contexto: `/api` do dono ou as APIs do portal (filtradas pelo cliente da sessão). */
    api: AxiosInstance
    /** Base das rotas do próprio plugin (`/p/{id}`, só no dono). */
    routeBase: string | null
    /** Canal Pusher do contexto (eventos do plugin chegam por ele). */
    channel_: string
}

const PluginHostContext = createContext<PluginHost | null>(null)

export function PluginHostProvider({ host, children }: { host: PluginHost; children: ReactNode }) {
    return <PluginHostContext.Provider value={host}>{children}</PluginHostContext.Provider>
}

/** Dados do plugin e o axios do contexto. */
export function usePluginHost(): PluginHost {
    const host = useContext(PluginHostContext)
    if (!host) throw new Error("usePluginHost só funciona dentro de um slot ou página de plugin")
    return host
}

/** Evento de plugin publicado pelo servidor (`ctx.realtime.publish(event, data)`). */
export const PLUGIN_EVENT = "plugin-event"

/** Assina um evento do próprio plugin (tempo real); cancela ao desmontar. */
export function usePluginEvent<T = Record<string, unknown>>(event: string, handler: (data: T) => void): void {
    const host = usePluginHost()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = host.channel_
        const channel = acquireChannel(name)
        const listener = (payload: { pluginId?: string; event?: string; data?: T }) => {
            if (payload?.pluginId === host.pluginId && payload.event === event) handler((payload.data ?? {}) as T)
        }
        channel.bind(PLUGIN_EVENT, listener)
        return () => {
            channel.unbind(PLUGIN_EVENT, listener)
            releaseChannel(name)
        }
    }, [event, handler, host.channel_, host.pluginId])
}

export interface PluginClientModule {
    /** Componentes por nome de exportação (referenciados em `plugin.json`: slots e páginas). */
    slots?: Record<string, unknown>
    pages?: Record<string, unknown>
}

/** Identidade tipada do export padrão do cliente do plugin. */
export const definePluginClient = <T extends PluginClientModule>(module: T): T => module
