"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"
import { usePersistentState } from "@/hooks/usePersistentState"
import { unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { ColumnColor } from "@/features/tasks/board"
import { useMaddoxSettings } from "@/features/maddox-agent/hooks/useMaddoxSettings"
import type { MaddoxClientStatusDto } from "@/features/maddox-agent/types"
import { CHAT_AGENT_IDS, activeAgentStorageKey, otherAgent, resolveActiveAgent, type ChatAgentId } from "../../agents"
import { buildAgentUiScope, type OpexClientUiScope, type OpexUiScope } from "../OpexScopeProvider"

/**
 * Estado do item único dos agentes de chat: quais agentes estão disponíveis, qual está ativo (o último
 * escolhido, guardado no navegador por dono ou por cliente/usuário), o escopo da interface de cada um,
 * a cor e se há sessão respondendo (para o ponto do item e o do botão do outro agente).
 */

export interface AgentSwitchValue {
    available: ChatAgentId[]
    active: ChatAgentId | null
    /** O agente do botão apagado do cabeçalho (`null` com um agente só). */
    other: ChatAgentId | null
    setActive: (id: ChatAgentId) => void
    scopes: Record<ChatAgentId, OpexUiScope>
    colors: Record<ChatAgentId, ColumnColor | null>
    busy: Record<ChatAgentId, boolean>
    reportBusy: (id: ChatAgentId, busy: boolean) => void
}

const AgentSwitchContext = createContext<AgentSwitchValue | null>(null)

const storedSchema = z.enum(CHAT_AGENT_IDS).nullable()

interface StatusLike {
    enabled: boolean
    color?: ColumnColor | null
}

/** Situação do agente no portal (mesma chave de cache do `useOpexStatus`, invalidada pelo tempo real do portal). */
function usePortalStatus(scope: OpexUiScope, enabled: boolean) {
    return useQuery({
        queryKey: [scope.queryPrefix, "status"],
        queryFn: async () => unwrapApi((await scope.http.get<ApiResponse<StatusLike & Partial<MaddoxClientStatusDto>>>(`${scope.apiBase}/status`)).data),
        enabled,
        staleTime: 30_000,
    })
}

export interface AgentSwitchProviderProps {
    /** Portal do cliente (sem = app do dono). */
    client?: OpexClientUiScope
    /** Portal: agentes ligados para o cliente segundo o servidor no carregamento da página. */
    initial?: Partial<Record<ChatAgentId, boolean>>
    children: ReactNode
}

export function AgentSwitchProvider({ client, initial, children }: AgentSwitchProviderProps) {
    const scopes = useMemo<Record<ChatAgentId, OpexUiScope>>(() => ({ opex: buildAgentUiScope("opex", client), maddox: buildAgentUiScope("maddox", client) }), [client])
    const portal = Boolean(client)
    const opexStatus = usePortalStatus(scopes.opex, portal)
    const maddoxStatus = usePortalStatus(scopes.maddox, portal)
    const maddoxSettings = useMaddoxSettings(!portal)

    const available = useMemo<ChatAgentId[]>(() => {
        // Dono: os dois sempre (o Maddox não configurado mostra o estado "não configurado" com o link).
        if (!portal) return [...CHAT_AGENT_IDS]
        const on: Record<ChatAgentId, boolean> = {
            opex: opexStatus.data?.enabled ?? initial?.opex ?? false,
            maddox: maddoxStatus.data?.enabled ?? initial?.maddox ?? false,
        }
        return CHAT_AGENT_IDS.filter((id) => on[id])
    }, [portal, opexStatus.data?.enabled, maddoxStatus.data?.enabled, initial?.opex, initial?.maddox])

    const colors = useMemo<Record<ChatAgentId, ColumnColor | null>>(
        () => ({ opex: null, maddox: (portal ? maddoxStatus.data?.color : maddoxSettings.data?.settings.color) ?? null }),
        [portal, maddoxStatus.data?.color, maddoxSettings.data?.settings.color],
    )

    const storageKey = activeAgentStorageKey(client?.clientId ?? null, client?.userId ?? null)
    const { value: stored, setValue: setStored } = usePersistentState<ChatAgentId | null>(storageKey, storedSchema, null)
    const active = resolveActiveAgent(stored, available)
    const [busy, setBusy] = useState<Record<ChatAgentId, boolean>>({ opex: false, maddox: false })
    const reportBusy = useCallback((id: ChatAgentId, value: boolean) => setBusy((current) => (current[id] === value ? current : { ...current, [id]: value })), [])
    const setActive = useCallback((id: ChatAgentId) => setStored(id), [setStored])

    const value = useMemo<AgentSwitchValue>(
        () => ({ available, active, other: otherAgent(active, available), setActive, scopes, colors, busy, reportBusy }),
        [available, active, setActive, scopes, colors, busy, reportBusy],
    )
    return <AgentSwitchContext.Provider value={value}>{children}</AgentSwitchContext.Provider>
}

export function useAgentSwitch(): AgentSwitchValue {
    const value = useContext(AgentSwitchContext)
    if (!value) throw new Error("useAgentSwitch fora do AgentSwitchProvider")
    return value
}
