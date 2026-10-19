"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import type { AxiosInstance } from "axios"
import { api } from "@/lib/api"
import { appChannel, opexChannel } from "@/lib/pusher/channel-names"
import { OPEX_AI_TAB, OPEX_TABS_STORAGE_KEY } from "../constants"
import { opexTabsStorageKey } from "../scope"

/**
 * Escopo da interface do Agente Opex: o app do dono (padrão) ou o portal do cliente. O mesmo painel
 * e os mesmos hooks servem aos dois: muda o prefixo da API, o cliente HTTP (o do portal envia
 * `x-client-id`), o canal do Pusher, a chave do cache e as abas guardadas no navegador.
 */

export interface OpexClientUiScope {
    clientId: string
    clientName: string
    userId: string
    userName: string
    isAdmin: boolean
    /** Axios do portal (cookie + `x-client-id`). */
    http: AxiosInstance
}

export interface OpexUiScope {
    kind: "owner" | "client"
    /** Prefixo das rotas, a partir de `/api` (ex.: `/opex`, `/cliente/opex`). */
    apiBase: string
    http: AxiosInstance
    /** Canal privado do Pusher. */
    channel: string
    /** Prefixo das chaves do TanStack Query. */
    queryPrefix: string
    tabsKey: string
    /** Onde configurar o agente (`null` no portal). */
    settingsHref: string | null
    clientName: string | null
}

export const OWNER_OPEX_SETTINGS_HREF = `/integracoes/ia?aba=${OPEX_AI_TAB}`

const OWNER_SCOPE: OpexUiScope = {
    kind: "owner",
    apiBase: "/opex",
    http: api,
    channel: appChannel(),
    queryPrefix: "opex-agent",
    tabsKey: OPEX_TABS_STORAGE_KEY,
    settingsHref: OWNER_OPEX_SETTINGS_HREF,
    clientName: null,
}

const OpexScopeContext = createContext<OpexUiScope>(OWNER_SCOPE)

/** Sem `client`, o escopo é o do dono (o app inteiro fora do portal). */
export function OpexScopeProvider({ client, children }: { client?: OpexClientUiScope; children: ReactNode }) {
    const value = useMemo<OpexUiScope>(() => {
        if (!client) return OWNER_SCOPE
        const prefix = `opex-agent:${client.clientId}:${client.userId}`
        return {
            kind: "client",
            apiBase: "/cliente/opex",
            http: client.http,
            channel: opexChannel(client.clientId, client.userId),
            queryPrefix: prefix,
            tabsKey: opexTabsStorageKey(client.clientId, client.userId),
            settingsHref: null,
            clientName: client.clientName,
        }
    }, [client])
    return <OpexScopeContext.Provider value={value}>{children}</OpexScopeContext.Provider>
}

export function useOpexScope(): OpexUiScope {
    return useContext(OpexScopeContext)
}
