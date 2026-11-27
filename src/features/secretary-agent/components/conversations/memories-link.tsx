"use client"

import { createContext, useContext, type ReactNode } from "react"
import { CONVERSATION_PARAM } from "../../memory-focus"
import { secretarySectionPath } from "../../links"

/** Link de "Abrir memórias" de uma conversa: por padrão, a seção Memórias de Integrações › IA › Agente Secretário. */
export type MemoriesHref = (chatId: string) => string

export const integrationMemoriesHref: MemoriesHref = (chatId) => secretarySectionPath("memorias", { [CONVERSATION_PARAM]: chatId })

const MemoriesLinkContext = createContext<MemoriesHref>(integrationMemoriesHref)

/** Troca o destino de "Abrir memórias" pela tela que mostra a aba Conversas (ex.: a página do agente, OPE-207). */
export function SecretaryMemoriesLinkProvider({ href, children }: { href: MemoriesHref; children: ReactNode }) {
    return <MemoriesLinkContext.Provider value={href}>{children}</MemoriesLinkContext.Provider>
}

export function useMemoriesHref(): MemoriesHref {
    return useContext(MemoriesLinkContext)
}
