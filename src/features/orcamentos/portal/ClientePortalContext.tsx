"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import type { AxiosInstance } from "axios"
import { createClientPortalApi } from "./api"

interface ClientePortalContextValue {
    token: string
    api: AxiosInstance
}

const ClientePortalContext = createContext<ClientePortalContextValue | null>(null)

/** Provê o token do cliente e o axios autenticado para as telas do portal. */
export function ClientePortalProvider({ token, children }: { token: string; children: ReactNode }) {
    const value = useMemo<ClientePortalContextValue>(() => ({ token, api: createClientPortalApi(token) }), [token])
    return <ClientePortalContext.Provider value={value}>{children}</ClientePortalContext.Provider>
}

export function useClientePortal(): ClientePortalContextValue {
    const ctx = useContext(ClientePortalContext)
    if (!ctx) throw new Error("ClientePortalProvider ausente")
    return ctx
}
