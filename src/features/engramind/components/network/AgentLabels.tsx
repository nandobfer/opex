"use client"

import { createContext, useContext } from "react"

const AgentLabelsContext = createContext<ReadonlyMap<string, string>>(new Map())

/** Nome de exibição dos agentes por `app/agente` (sem o prefixo "Agente"), para o chip do autor no card. */
export const AgentLabelsProvider = AgentLabelsContext.Provider

/** Nome do agente pelo `app/agente`; fora do provider ou agente desconhecido, o próprio `app/agente`. */
export function useAgentLabel(qualified: string): string {
    return useContext(AgentLabelsContext).get(qualified) ?? qualified
}
