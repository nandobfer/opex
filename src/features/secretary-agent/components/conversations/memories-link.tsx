"use client"

import { createContext, useContext, type ReactNode } from "react"
import { CONVERSATION_PARAM } from "../../memory-focus"
import { secretarySectionPath } from "../../links"

/** Link de "Abrir memórias" de uma conversa: por padrão, a seção Memórias de Integrações › IA › Agente Secretário. */
export type MemoriesHref = (chatId: string) => string

export const integrationMemoriesHref: MemoriesHref = (chatId) => secretarySectionPath("memorias", { [CONVERSATION_PARAM]: chatId })

interface MemoriesLink {
    href: MemoriesHref
    /**
     * A tela troca de aba pela URL sem navegar (`navigateInPage`): só onde quem lê a aba e a conversa escuta essa troca
     * (a página do agente). Em Integrações › IA a seção vem de outro mecanismo e o link navega normalmente.
     */
    inPage: boolean
}

const MemoriesLinkContext = createContext<MemoriesLink>({ href: integrationMemoriesHref, inPage: false })

/** Troca o destino de "Abrir memórias" pela tela que mostra a aba Conversas (ex.: a página do agente, OPE-207). */
export function SecretaryMemoriesLinkProvider({ href, inPage = false, children }: { href: MemoriesHref; inPage?: boolean; children: ReactNode }) {
    return <MemoriesLinkContext.Provider value={{ href, inPage }}>{children}</MemoriesLinkContext.Provider>
}

export function useMemoriesHref(): MemoriesHref {
    return useContext(MemoriesLinkContext).href
}

/** "Abrir memórias" troca a aba sem navegar (só na página do agente). */
export function useMemoriesInPage(): boolean {
    return useContext(MemoriesLinkContext).inPage
}
