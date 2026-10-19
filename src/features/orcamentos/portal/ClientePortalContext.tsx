"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import type { AxiosInstance } from "axios"
import type { ClienteSelectableDto } from "../types"
import { createClientePortalApi } from "./api"

export interface ClientePortalSession {
    clientId: string
    clientName: string
    isAdmin: boolean
    /** `true` quando o **dono** está pré-visualizando a visão do cliente. */
    preview: boolean
    user: { id: string; username: string; email: string | null }
    clients: ClienteSelectableDto[]
    /** Agente Opex liberado para este cliente (configuração do dono; padrão ativado). */
    opexEnabled: boolean
}

interface ClientePortalContextValue extends ClientePortalSession {
    api: AxiosInstance
}

const ClientePortalContext = createContext<ClientePortalContextValue | null>(null)

/** Provê a sessão do portal (cliente, usuário e papel) e o axios autenticado por cookie. */
export function ClientePortalProvider({ session, children }: { session: ClientePortalSession; children: ReactNode }) {
    const value = useMemo<ClientePortalContextValue>(() => ({ ...session, api: createClientePortalApi(session.clientId) }), [session])
    return <ClientePortalContext.Provider value={value}>{children}</ClientePortalContext.Provider>
}

export function useClientePortal(): ClientePortalContextValue {
    const ctx = useContext(ClientePortalContext)
    if (!ctx) throw new Error("ClientePortalProvider ausente")
    return ctx
}
