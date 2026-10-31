"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import type { AxiosInstance } from "axios"
import { api } from "@/lib/api"
import { appChannel, opexChannel } from "@/lib/pusher/channel-names"
import type { ChatAgentId } from "../agents"
import { CHAT_AGENTS, type ChatAgentDescriptor } from "./agents/agent-descriptors"

/**
 * Escopo da interface de um agente de chat: qual agente (Opex ou Maddox) e onde (app do dono, padrão,
 * ou portal do cliente). O mesmo painel e os mesmos hooks servem a todos: muda o prefixo da API, o
 * cliente HTTP (o do portal envia `x-client-id`), o canal e os eventos do Pusher, a chave do cache e as
 * abas guardadas no navegador.
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
    agent: ChatAgentDescriptor
    /** Prefixo das rotas, a partir de `/api` (ex.: `/opex`, `/cliente/maddox`). */
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

export const OWNER_OPEX_SETTINGS_HREF = CHAT_AGENTS.opex.settingsHref

/** Escopo da interface de um agente (dono sem `client`; portal com o cliente e o usuário logados). */
export function buildAgentUiScope(agentId: ChatAgentId, client?: OpexClientUiScope): OpexUiScope {
    const agent = CHAT_AGENTS[agentId]
    if (!client) {
        return { kind: "owner", agent, apiBase: agent.ownerApiBase, http: api, channel: appChannel(), queryPrefix: agent.queryPrefix, tabsKey: agent.tabsKey, settingsHref: agent.settingsHref, clientName: null }
    }
    return {
        kind: "client",
        agent,
        apiBase: agent.clientApiBase,
        http: client.http,
        channel: opexChannel(client.clientId, client.userId),
        queryPrefix: `${agent.queryPrefix}:${client.clientId}:${client.userId}`,
        tabsKey: `${agent.tabsKey}:${client.clientId}:${client.userId}`,
        settingsHref: null,
        clientName: client.clientName,
    }
}

const OWNER_SCOPE = buildAgentUiScope("opex")

const OpexScopeContext = createContext<OpexUiScope>(OWNER_SCOPE)

/** Sem `client`, o escopo é o do dono; sem `agent`, o Agente Opex. `value` usa um escopo já montado. */
export function OpexScopeProvider({ client, agent = "opex", value, children }: { client?: OpexClientUiScope; agent?: ChatAgentId; value?: OpexUiScope; children: ReactNode }) {
    const built = useMemo<OpexUiScope>(() => value ?? buildAgentUiScope(agent, client), [value, agent, client])
    return <OpexScopeContext.Provider value={built}>{children}</OpexScopeContext.Provider>
}

export function useOpexScope(): OpexUiScope {
    return useContext(OpexScopeContext)
}
